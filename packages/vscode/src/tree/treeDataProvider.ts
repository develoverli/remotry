import * as vscode from "vscode";
import { listProjects, relativeTime, ProjectConfig } from "@develoverli/remotry-core";

export class ProjectsTreeDataProvider implements vscode.TreeDataProvider<ProjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectItem): Promise<ProjectItem[]> {
    if (element) return [];
    const projects = listProjects();
    const names = Object.keys(projects).sort();
    return names.map((name) => new ProjectItem(projects[name], this.extensionUri));
  }
}

export class ProjectItem extends vscode.TreeItem {
  contextValue = "project";

  constructor(public readonly project: ProjectConfig, extensionUri: vscode.Uri) {
    super(project.name, vscode.TreeItemCollapsibleState.None);
    const last = project.lastDeploy ? relativeTime(project.lastDeploy) : "never";
    this.description = `${project.framework ?? project.projectType} · ${last}`;
    this.tooltip = `${project.remoteUser}@${project.remoteHost}:${project.remotePath}\n${project.localPath}`;
    this.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, "media", "tree-light.svg"),
      dark: vscode.Uri.joinPath(extensionUri, "media", "tree-dark.svg"),
    };
    this.command = {
      command: "deploy.status",
      title: "Status",
      arguments: [project.name],
    };
  }
}
