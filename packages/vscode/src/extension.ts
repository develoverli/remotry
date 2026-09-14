import * as vscode from "vscode";
import { ProjectsTreeDataProvider } from "./tree/treeDataProvider";
import { registerDeployCommands } from "./commands/deployCommands";

export function activate(context: vscode.ExtensionContext) {
  const treeDataProvider = new ProjectsTreeDataProvider(context.extensionUri);
  vscode.window.registerTreeDataProvider("deployProjects", treeDataProvider);
  registerDeployCommands(context, treeDataProvider);
  vscode.commands.executeCommand("setContext", "deploy.active", true);
}

export function deactivate() {}
