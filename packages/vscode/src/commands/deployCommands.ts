import * as vscode from "vscode";
import {
  listProjects,
  removeProject,
  getProjectStatus,
  deployProject,
  store,
} from "@develoverli/remotry-core";
import { ProjectsTreeDataProvider, ProjectItem } from "../tree/treeDataProvider";
import { openRegisterForm } from "../webview/registerForm";

export function registerDeployCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: ProjectsTreeDataProvider
) {
  const output = vscode.window.createOutputChannel("Deploy");

  const projectNameArg = (arg: unknown): string | undefined => {
    if (typeof arg === "string") return arg;
    if (arg instanceof ProjectItem) return arg.project.name;
    return undefined;
  };

  const pickProject = async (): Promise<string | undefined> => {
    const projects = listProjects();
    const names = Object.keys(projects);
    if (names.length === 0) {
      vscode.window.showInformationMessage("No projects registered. Use Register to add one.");
      return undefined;
    }
    return vscode.window.showQuickPick(names, { placeHolder: "Pick a project" });
  };

  context.subscriptions.push(
    output,

    vscode.commands.registerCommand("deploy.refresh", () => treeDataProvider.refresh()),

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
        const p = projects[name];
        output.appendLine(`  ${name} → ${p.remoteUser}@${p.remoteHost}:${p.remotePath}`);
      }
    }),

    vscode.commands.registerCommand("deploy.register", async (arg?: unknown) => {
      const editName = projectNameArg(arg);
      await openRegisterForm(context, treeDataProvider, editName);
    }),

    vscode.commands.registerCommand("deploy.status", async (arg?: unknown) => {
      const name = projectNameArg(arg) ?? (await pickProject());
      if (!name) return;
      try {
        const { project, lastDeployRelative, neverDeployed } = getProjectStatus(name);
        output.show();
        output.appendLine(`\n=== Status: ${name} ===`);
        output.appendLine(`Local:    ${project.localPath}`);
        output.appendLine(`Remote:   ${project.remoteUser}@${project.remoteHost}:${project.remotePath}`);
        output.appendLine(`Build:    ${project.buildCommand}`);
        output.appendLine(`Output:   ${project.buildPath}`);
        output.appendLine(`Type:     ${project.framework ?? project.projectType}`);
        output.appendLine(`Deployed: ${neverDeployed ? "never" : lastDeployRelative}`);
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : "Unknown error");
      }
    }),

    vscode.commands.registerCommand("deploy.remove", async (arg?: unknown) => {
      const name = projectNameArg(arg) ?? (await pickProject());
      if (!name) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove project "${name}"?`,
        { modal: true },
        "Remove"
      );
      if (confirm !== "Remove") return;
      try {
        removeProject(name);
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Project "${name}" removed.`);
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : "Unknown error");
      }
    }),

    vscode.commands.registerCommand("deploy.deploy", async (arg?: unknown) => {
      const name = projectNameArg(arg) ?? (await pickProject());
      if (!name) return;
      output.show(true);
      output.appendLine(`\n=== Deploy ${name} ===`);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Deploying ${name}`,
          cancellable: false,
        },
        async (progress) => {
          try {
            for await (const event of deployProject(name)) {
              switch (event.type) {
                case "step":
                  progress.report({ message: event.message });
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
                  progress.report({ message: `${event.current}/${event.total} ${event.file}` });
                  break;
                case "error":
                  output.appendLine(`✗ ${event.message}`);
                  break;
                case "done":
                  output.appendLine(`✓ Done in ${(event.durationMs / 1000).toFixed(1)}s · ${event.filesUploaded ?? 0} files`);
                  break;
              }
            }
            treeDataProvider.refresh();
            vscode.window.showInformationMessage(`Deployed ${name}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            output.appendLine(`✗ ${msg}`);
            vscode.window.showErrorMessage(`Deploy ${name} failed: ${msg}`);
          }
        }
      );
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
