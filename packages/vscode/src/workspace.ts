import * as vscode from "vscode";
import * as path from "path";
import { ProjectConfig } from "@develoverli/remotry-core";

function normalizePath(p: string): string {
  const resolved = path.resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Whether a project's local path is one of the folders open in this window. */
export function isWorkspaceProject(project: Pick<ProjectConfig, "localPath">): boolean {
  const target = normalizePath(project.localPath);
  return (vscode.workspace.workspaceFolders ?? []).some((f) => normalizePath(f.uri.fsPath) === target);
}
