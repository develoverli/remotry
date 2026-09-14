import * as vscode from "vscode";
import { registerDeployCommands } from "./commands/deployCommands";
import { CredentialVault } from "./credentials";
import { DeployState } from "./deployState";
import { DeployStatusBar } from "./statusBar";
import { PROJECTS_VIEW_ID, ProjectsViewProvider } from "./panel/projectsView";

export function activate(context: vscode.ExtensionContext) {
  const state = new DeployState();
  const vault = new CredentialVault(context.secrets);
  const view = new ProjectsViewProvider(context.extensionUri, state);

  context.subscriptions.push(
    state,
    view,
    vscode.window.registerWebviewViewProvider(PROJECTS_VIEW_ID, view),
    new DeployStatusBar(state)
  );
  registerDeployCommands(context, state, vault, view);
  vscode.commands.executeCommand("setContext", "deploy.active", true);
}

export function deactivate() {}
