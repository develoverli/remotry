import fs from "fs-extra";
import path from "path";
import os from "os";

export interface GlobalConfig {
  sshKey: string;
  sshPort: number;
  defaultRemoteUser: string;
  defaultRemoteBase: string;
}

export interface ProjectDeployrc {
  name?: string;
  localPath?: string;
  remotePath?: string;
  buildCommand?: string;
  buildPath?: string;
  installCommand?: string;
  projectType?: string;
  framework?: string;
  sshKey?: string;
  remoteHost?: string;
  remotePort?: number;
  remoteUser?: string;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  sshKey: "~/.ssh/id_rsa",
  sshPort: 22,
  defaultRemoteUser: "root",
  defaultRemoteBase: "/var/www",
};

export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".deployrc");
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return { ...DEFAULT_GLOBAL_CONFIG, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  const configPath = getGlobalConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function loadProjectDeployrc(projectPath: string): ProjectDeployrc | null {
  const rcPath = path.join(projectPath, ".deployrc");
  if (!fs.existsSync(rcPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(rcPath, "utf-8");
    return JSON.parse(content) as ProjectDeployrc;
  } catch {
    return null;
  }
}

export function saveProjectDeployrc(projectPath: string, config: ProjectDeployrc): void {
  const rcPath = path.join(projectPath, ".deployrc");
  fs.writeFileSync(rcPath, JSON.stringify(config, null, 2), "utf-8");
}
