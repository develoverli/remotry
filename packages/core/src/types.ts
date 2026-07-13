export interface ProjectConfig {
  name: string;
  localPath: string;
  remoteHost: string;
  remotePort: number;
  remoteUser: string;
  remotePath: string;
  buildCommand: string;
  buildPath: string;
  installCommand?: string;
  projectType: string;
  framework?: string;
  sshKey?: string;
  lastDeploy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigStore {
  projects: Record<string, ProjectConfig>;
}

export interface GlobalConfig {
  sshKey: string;
  sshPort: number;
  defaultRemoteUser: string;
  defaultRemoteBase: string;
}