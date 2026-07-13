import { store } from "../store";
import { ProjectConfig } from "../types";

export function listProjects(): Record<string, ProjectConfig> {
  return store.listProjects();
}

export function listProjectNames(): string[] {
  return Object.keys(store.listProjects()).sort();
}
