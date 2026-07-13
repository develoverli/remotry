import { store } from "../store";
import { ProjectConfig } from "../types";

export type ProjectPatch = Partial<Omit<ProjectConfig, "name" | "createdAt">>;

export function updateProject(name: string, patch: ProjectPatch): ProjectConfig {
  const existing = store.getProject(name);
  if (!existing) {
    throw new Error(`Project "${name}" not found.`);
  }
  const updated: ProjectConfig = {
    ...existing,
    ...patch,
    name: existing.name,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  store.addProject(updated, true);
  return updated;
}
