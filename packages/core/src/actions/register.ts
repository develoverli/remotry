import path from "path";
import os from "os";
import { store } from "../store";
import { ProjectConfig } from "../types";

export interface RegisterInput {
  name: string;
  localPath: string;
  remote: string;
  buildCommand?: string;
  buildPath?: string;
  installCommand?: string;
  projectType?: string;
  framework?: string;
  sshKey?: string;
  remotePort?: number;
  update?: boolean;
}

export interface ParsedRemote {
  user: string;
  host: string;
  path: string;
}

export function parseRemote(remote: string, defaultUser?: string): ParsedRemote {
  const match = remote.match(/^(?:([^@]+)@)?([^:]+):\/?(.+)$/);
  if (!match) {
    throw new Error(`Invalid remote format: "${remote}". Expected user@host:/path`);
  }
  return {
    user: match[1] || defaultUser || os.userInfo().username,
    host: match[2],
    path: "/" + match[3],
  };
}

export function registerProject(input: RegisterInput): ProjectConfig {
  if (!input.name) throw new Error("Project name is required");
  if (!input.localPath) throw new Error("Local path is required");
  if (!input.remote) throw new Error("Remote destination is required");

  const existing = store.getProject(input.name);
  if (existing && !input.update) {
    throw new Error(`Project "${input.name}" already exists. Pass update: true to modify.`);
  }

  const parsed = parseRemote(input.remote);
  const now = new Date().toISOString();

  const project: ProjectConfig = {
    name: input.name,
    localPath: path.resolve(input.localPath),
    remoteHost: parsed.host,
    remotePort: input.remotePort ?? existing?.remotePort ?? 22,
    remoteUser: parsed.user,
    remotePath: parsed.path,
    buildCommand: input.buildCommand ?? existing?.buildCommand ?? "pnpm build",
    buildPath: input.buildPath ?? existing?.buildPath ?? "./dist",
    installCommand: input.installCommand ?? existing?.installCommand ?? "",
    projectType: input.projectType ?? existing?.projectType ?? "node",
    framework: input.framework ?? existing?.framework,
    sshKey: input.sshKey ?? existing?.sshKey ?? "",
    lastDeploy: existing?.lastDeploy,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.addProject(project, !!input.update);
  return project;
}
