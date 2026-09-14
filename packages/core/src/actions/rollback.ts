import path from "path";
import { store } from "../store";
import { Credentials, ProjectConfig, targetTypeOf } from "../types";
import { connectSSH, defaultBackupPath } from "../connection";
import { activateFolderRelease, listFolderReleases } from "../folder";
import { activateRemoteRelease, listRemoteReleases, remoteLayout, runRemotePostDeploy } from "../remote";
import { runLocalPostDeploy } from "./deploy";

export interface RollbackOptions {
  /** Roll back to this specific release name (see `list`). */
  version?: string;
  /** List available releases instead of rolling back. */
  list?: boolean;
  /** Secrets for password auth or passphrase-protected keys. Never persisted. */
  credentials?: Credentials;
}

export interface RollbackResult {
  available: boolean;
  output: string;
}

export interface ProjectReleases {
  /** Release names, newest first. */
  releases: string[];
  /** The release currently live, or "" if unknown. */
  current: string;
}

function getProjectOrThrow(name: string): ProjectConfig {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found.`);
  }
  return project;
}

function folderPaths(project: ProjectConfig): { folderPath: string; backupPath: string } {
  if (!project.folderPath) throw new Error(`Project "${project.name}" has no target folder configured.`);
  const folderPath = path.resolve(project.folderPath);
  return { folderPath, backupPath: path.resolve(project.backupPath || defaultBackupPath(folderPath)) };
}

/** List a project's stored releases, newest first, with the live one marked. */
export async function getProjectReleases(name: string, credentials?: Credentials): Promise<ProjectReleases> {
  const project = getProjectOrThrow(name);
  if (targetTypeOf(project) === "folder") {
    return listFolderReleases(folderPaths(project).backupPath);
  }
  const ssh = await connectSSH(project, credentials);
  try {
    return await listRemoteReleases(ssh, remoteLayout(project));
  } finally {
    ssh.disconnect();
  }
}

function pickTarget(
  { releases, current }: ProjectReleases,
  version: string | undefined
): { target?: string; error?: string } {
  if (version) {
    return releases.includes(version)
      ? { target: version }
      : { error: `Release "${version}" not found. Use --list to see available releases.` };
  }
  // releases are newest-first, so the entry after the current one is the previous deploy.
  const currentIdx = current ? releases.indexOf(current) : -1;
  const previousIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
  if (previousIdx >= releases.length) {
    return { error: "No previous release to roll back to." };
  }
  return { target: releases[previousIdx] };
}

function formatList({ releases, current }: ProjectReleases): string {
  return releases.map((r) => `${r === current ? "* " : "  "}${r}`).join("\n");
}

/** Run the post-deploy command after a rollback; report failure without undoing the rollback. */
async function afterRollback(summary: string, run: () => Promise<string>): Promise<RollbackResult> {
  try {
    const output = await run();
    return { available: true, output: output ? `${summary}\n${output}` : summary };
  } catch (err) {
    return { available: false, output: `${summary}, but ${err instanceof Error ? err.message : "the post-deploy command failed"}` };
  }
}

export async function rollbackProject(name: string, options: RollbackOptions = {}): Promise<RollbackResult> {
  const project = getProjectOrThrow(name);

  if (targetTypeOf(project) === "folder") {
    const { folderPath, backupPath } = folderPaths(project);
    const info = await listFolderReleases(backupPath);
    if (info.releases.length === 0) {
      return { available: false, output: "No releases found. Deploy at least once first." };
    }
    if (options.list) return { available: true, output: formatList(info) };

    const { target, error } = pickTarget(info, options.version);
    if (!target) return { available: false, output: error as string };
    await activateFolderRelease(folderPath, backupPath, target);
    const summary = `Rolled back "${name}" — ${folderPath} now serves ${target}`;
    return project.postDeployCommand
      ? afterRollback(summary, () => runLocalPostDeploy(project.postDeployCommand as string, folderPath))
      : { available: true, output: summary };
  }

  const layout = remoteLayout(project);
  const ssh = await connectSSH(project, options.credentials);
  try {
    const info = await listRemoteReleases(ssh, layout);
    if (info.releases.length === 0) {
      return { available: false, output: "No releases found on the remote. Deploy at least once first." };
    }
    if (options.list) return { available: true, output: formatList(info) };

    const { target, error } = pickTarget(info, options.version);
    if (!target) return { available: false, output: error as string };

    try {
      await activateRemoteRelease(ssh, layout, target);
    } catch (err) {
      return { available: false, output: err instanceof Error ? err.message : "Failed to activate the release." };
    }

    const summary =
      layout.activation === "symlink"
        ? `Rolled back "${name}" — current -> ${target}`
        : `Rolled back "${name}" — ${layout.liveDir} now serves ${target}`;
    return project.postDeployCommand
      ? afterRollback(summary, () => runRemotePostDeploy(ssh, layout, project.postDeployCommand as string))
      : { available: true, output: summary };
  } finally {
    ssh.disconnect();
  }
}
