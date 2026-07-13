import { store } from "../store";
import { ProjectConfig } from "../types";

export interface ProjectStatus {
  project: ProjectConfig;
  lastDeployRelative: string;
  neverDeployed: boolean;
}

export function getProjectStatus(name: string): ProjectStatus {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found.`);
  }

  if (!project.lastDeploy) {
    return { project, lastDeployRelative: "never", neverDeployed: true };
  }

  return {
    project,
    lastDeployRelative: relativeTime(project.lastDeploy),
    neverDeployed: false,
  };
}

export function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffM = Math.floor(diffMs / (1000 * 60));
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffD > 30) return date.toLocaleDateString();
  if (diffD > 0) return `${diffD}d ago`;
  if (diffH > 0) return `${diffH}h ago`;
  if (diffM > 0) return `${diffM}m ago`;
  return "just now";
}
