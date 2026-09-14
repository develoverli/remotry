import * as vscode from "vscode";
import { listProjects } from "@develoverli/remotry-core";
import { DeployState } from "./deployState";
import { isWorkspaceProject } from "./workspace";

// Left side, after the built-in source control and problems items.
const STATUS_BAR_PRIORITY = -100;

/** One-click deploy for the project(s) registered for the open workspace. */
export class DeployStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly state: DeployState) {
    this.item.name = "Remotry Deploy";
    this.subscriptions = [
      state.onDidChange(() => this.update()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.update()),
    ];
    this.update();
  }

  update(): void {
    if (!vscode.workspace.workspaceFolders?.length) {
      this.item.hide();
      return;
    }

    const names = Object.values(listProjects())
      .filter(isWorkspaceProject)
      .map((p) => p.name)
      .sort();

    if (names.length === 0) {
      this.item.text = "$(add) Register for deploy";
      this.item.tooltip = "Register this workspace as a Remotry deploy project";
      this.item.command = "deploy.register";
    } else if (names.length === 1) {
      const [name] = names;
      if (this.state.isDeploying(name)) {
        this.item.text = `$(sync~spin) Deploying ${name}`;
        this.item.tooltip = "Deploy in progress";
        this.item.command = "deployProjects.focus";
      } else {
        this.item.text = `$(cloud-upload) Deploy ${name}`;
        this.item.tooltip = `Build and deploy ${name}`;
        this.item.command = { command: "deploy.deploy", title: "Deploy", arguments: [name] };
      }
    } else {
      this.item.text = "$(cloud-upload) Deploy...";
      this.item.tooltip = `Deploy one of: ${names.join(", ")}`;
      this.item.command = { command: "deploy.deploy", title: "Deploy", arguments: [names] };
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
    this.subscriptions.forEach((s) => s.dispose());
  }
}
