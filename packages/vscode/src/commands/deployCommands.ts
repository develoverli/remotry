import * as vscode from "vscode";
import {
  listProjects,
  removeProject,
  getProjectStatus,
  deployProject,
  getProjectReleases,
  rollbackProject,
  testConnection,
  describeTarget,
  authMethodOf,
  targetTypeOf,
  store,
  ProjectConfig,
  PRE_REMOTRY_RELEASE,
  Credentials,
} from "@develoverli/remotry-core";
import { DeployState } from "../deployState";
import { ProjectsViewProvider } from "../panel/projectsView";
import { openRegisterForm } from "../webview/registerForm";
import { CredentialVault, withCredentials } from "../credentials";
import { hintFor, showErrorWithHint } from "../hints";

/** `2026-09-14T15-51-38-693Z` -> local date/time; the pre-Remotry snapshot gets a friendly name. */
function releaseLabel(release: string): string {
  if (release === PRE_REMOTRY_RELEASE) return "Before first Remotry deploy";
  const iso = release.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/, "$1:$2:$3.$4");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? release : date.toLocaleString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function registerDeployCommands(
  context: vscode.ExtensionContext,
  state: DeployState,
  vault: CredentialVault,
  view: ProjectsViewProvider
) {
  const output = vscode.window.createOutputChannel("Deploy");

  const pickProject = async (only?: string[]): Promise<string | undefined> => {
    const names = only ?? Object.keys(listProjects()).sort();
    if (names.length === 0) {
      const choice = await vscode.window.showInformationMessage("No projects registered yet.", "Register a Project");
      if (choice) await vscode.commands.executeCommand("deploy.register");
      return undefined;
    }
    return vscode.window.showQuickPick(names, { placeHolder: "Pick a project" });
  };

  /** Accepts a project name, a list of names to choose from, or nothing (pick from all). */
  const resolveProject = async (arg: unknown): Promise<ProjectConfig | undefined> => {
    let name: string | undefined;
    if (typeof arg === "string") name = arg;
    else if (Array.isArray(arg) && arg.every((n) => typeof n === "string")) name = await pickProject(arg);
    else name = await pickProject();
    if (!name) return undefined;
    const project = store.getProject(name);
    if (!project) vscode.window.showErrorMessage(`Project "${name}" not found.`);
    return project;
  };

  context.subscriptions.push(
    output,

    vscode.commands.registerCommand("deploy.refresh", () => state.changed()),

    vscode.commands.registerCommand("deploy.list", () => {
      const projects = listProjects();
      const names = Object.keys(projects);
      if (names.length === 0) {
        vscode.window.showInformationMessage("No projects registered.");
        return;
      }
      output.show();
      output.appendLine(`Registered projects (${names.length}):`);
      for (const name of names.sort()) {
        output.appendLine(`  ${name} → ${describeTarget(projects[name])}`);
      }
    }),

    vscode.commands.registerCommand("deploy.register", async (arg?: unknown) => {
      const editName = typeof arg === "string" ? arg : undefined;
      await openRegisterForm(context, state, vault, editName);
    }),

    vscode.commands.registerCommand("deploy.status", async (arg?: unknown) => {
      const project = await resolveProject(arg);
      if (!project) return;
      try {
        const { lastDeployRelative, neverDeployed } = getProjectStatus(project.name);
        output.show();
        output.appendLine(`\n=== Status: ${project.name} ===`);
        output.appendLine(`Local:    ${project.localPath}`);
        output.appendLine(`Target:   ${describeTarget(project)}`);
        if (targetTypeOf(project) === "ssh") output.appendLine(`Auth:     ${authMethodOf(project)}`);
        else output.appendLine(`Releases: ${project.backupPath ?? ""}`);
        output.appendLine(`Build:    ${project.buildCommand}`);
        output.appendLine(`Output:   ${project.buildPath}`);
        output.appendLine(`Type:     ${project.framework ?? project.projectType}`);
        output.appendLine(`Deployed: ${neverDeployed ? "never" : lastDeployRelative}`);
        if (project.lastDeployStatus === "failed") {
          output.appendLine(`Last attempt failed: ${project.lastDeployError ?? "unknown error"}`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(errorMessage(err));
      }
    }),

    vscode.commands.registerCommand("deploy.remove", async (arg?: unknown) => {
      const project = await resolveProject(arg);
      if (!project) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove project "${project.name}"?`,
        {
          modal: true,
          detail: "Unregisters it from Remotry and forgets its saved password. Nothing on the server or target folder is deleted.",
        },
        "Remove"
      );
      if (confirm !== "Remove") return;
      try {
        removeProject(project.name);
        await vault.forget(project.name);
        state.clear(project.name);
        vscode.window.showInformationMessage(`Project "${project.name}" removed.`);
      } catch (err) {
        vscode.window.showErrorMessage(errorMessage(err));
      }
    }),

    vscode.commands.registerCommand("deploy.testConnection", async (arg?: unknown) => {
      const project = await resolveProject(arg);
      if (!project) return;
      try {
        const result = await withCredentials(vault, project, (credentials) =>
          Promise.resolve(
            vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: `Testing ${describeTarget(project)}...` },
              () => testConnection(project, credentials)
            )
          )
        );
        if (!result) return;
        if (result.ok) vscode.window.showInformationMessage(result.message);
        else {
          await showErrorWithHint("Connection test failed.", result.message, project.name, hintFor(project, result.message), {
            skip: ["testConnection"],
          });
        }
      } catch (err) {
        vscode.window.showErrorMessage(errorMessage(err));
      }
    }),

    vscode.commands.registerCommand("deploy.deploy", async (arg?: unknown) => {
      const project = await resolveProject(arg);
      if (!project) return;
      const name = project.name;
      if (state.isDeploying(name)) {
        view.reveal();
        return;
      }

      state.start(name);
      output.appendLine(`
=== Deploy ${name} → ${describeTarget(project)} ===`);

      const runDeploy = async (credentials: Credentials, progress?: vscode.Progress<{ message?: string }>) => {
        for await (const event of deployProject(name, { credentials })) {
          state.apply(name, event);
          switch (event.type) {
            case "step":
              progress?.report({ message: event.message });
              output.appendLine(`[${event.current}/${event.total}] ${event.message}`);
              break;
            case "info":
              output.appendLine(event.message);
              break;
            case "warn":
              output.appendLine(`⚠ ${event.message}`);
              break;
            case "success":
              output.appendLine(`✓ ${event.message}`);
              break;
            case "progress":
              progress?.report({
                message:
                  event.unit === "bytes"
                    ? `Uploading archive ${Math.round((event.current / event.total) * 100)}%`
                    : `${event.current}/${event.total} ${event.file}`,
              });
              break;
            case "error":
              output.appendLine(`✗ ${event.message}`);
              break;
            case "done":
              output.appendLine(`✓ Done in ${(event.durationMs / 1000).toFixed(1)}s · ${event.filesUploaded ?? 0} files`);
              break;
          }
        }
        return true;
      };

      try {
        // The sidebar card already shows live progress; only pop a notification when it is hidden.
        const done = await withCredentials(vault, project, (credentials) =>
          view.visible
            ? runDeploy(credentials)
            : Promise.resolve(
                vscode.window.withProgress(
                  { location: vscode.ProgressLocation.Notification, title: `Deploying ${name}`, cancellable: false },
                  (progress) => runDeploy(credentials, progress)
                )
              )
        );
        if (done) {
          state.succeed(name);
          if (!view.visible) vscode.window.showInformationMessage(`Deployed ${name}`);
        } else {
          output.appendLine("Cancelled.");
          state.clear(name);
        }
      } catch (err) {
        const msg = errorMessage(err);
        output.appendLine(`✗ ${msg}`);
        state.fail(name, msg);
        if (!view.visible) {
          const hint = hintFor(project, msg);
          const choice = await showErrorWithHint(`Deploy ${name} failed.`, msg, name, hint, {
            extraActions: ["Show Log", "Roll Back..."].filter(
              (label) => !hint?.actions.some((a) => (a === "showLog" && label === "Show Log") || (a === "rollback" && label === "Roll Back..."))
            ),
          });
          if (choice === "Show Log") output.show();
          if (choice === "Roll Back...") await vscode.commands.executeCommand("deploy.rollback", name);
        }
      }
    }),

    vscode.commands.registerCommand("deploy.showLog", () => output.show()),

    vscode.commands.registerCommand("deploy.rollback", async (arg?: unknown) => {
      const project = await resolveProject(arg);
      if (!project) return;
      const name = project.name;
      if (state.isDeploying(name)) {
        vscode.window.showInformationMessage(`Wait for "${name}" to finish deploying.`);
        return;
      }

      try {
        const info = await withCredentials(vault, project, (credentials) =>
          Promise.resolve(
            vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: `Loading releases for ${name}...` },
              () => getProjectReleases(name, credentials)
            )
          )
        );
        if (!info) return;

        const candidates = info.releases.filter((r) => r !== info.current);
        if (candidates.length === 0) {
          vscode.window.showInformationMessage(`No earlier release of "${name}" to roll back to.`);
          return;
        }

        const picked = await vscode.window.showQuickPick(
          candidates.map((release) => ({ label: releaseLabel(release), description: release, release })),
          {
            title: `Roll back ${name}`,
            placeHolder: info.current ? `Live now: ${releaseLabel(info.current)}. Pick the release to restore.` : "Pick the release to restore",
          }
        );
        if (!picked) return;

        const confirm = await vscode.window.showWarningMessage(
          `Roll back "${name}" to ${picked.label}?`,
          { modal: true, detail: `${describeTarget(project)} will serve that release immediately.` },
          "Roll Back"
        );
        if (confirm !== "Roll Back") return;

        const result = await withCredentials(vault, project, (credentials) =>
          rollbackProject(name, { version: picked.release, credentials })
        );
        if (!result) return;
        if (result.available) {
          output.appendLine(result.output);
          vscode.window.showInformationMessage(`Rolled back "${name}" to ${picked.label}.`);
        } else {
          vscode.window.showErrorMessage(result.output);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Roll back ${name} failed: ${errorMessage(err)}`);
      } finally {
        state.changed();
      }
    }),

    vscode.commands.registerCommand("deploy.openConfig", async () => {
      const uri = vscode.Uri.file(store.getConfigPath());
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        vscode.window.showInformationMessage("Config file not created yet. Register a project first.");
        return;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    })
  );
}
