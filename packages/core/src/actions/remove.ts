import { store } from "../store";

export function removeProject(name: string): boolean {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found.`);
  }
  return store.removeProject(name);
}
