/** Where a project is deployed: a remote server over SSH/SFTP, or a local/network folder. */
export type TargetType = "ssh" | "folder";

/** How an SSH target authenticates. Secrets are never stored in project config. */
export type AuthMethod = "key" | "password" | "agent";

/**
 * How an SSH deploy goes live.
 * - `copy`: the remote path holds the real files; releases are kept in `backupPath`.
 * - `symlink`: the remote path holds `releases/` and a `current` symlink to the live one.
 */
export type Activation = "copy" | "symlink";

/** How SSH deploys transfer the build: one compressed archive, or file by file over SFTP. */
export type UploadMode = "archive" | "files";

export type DeployStatus = "success" | "failed";

export interface ProjectConfig {
  name: string;
  localPath: string;
  /** Defaults to "ssh" for projects registered before 1.1.0. */
  targetType?: TargetType;
  /** Defaults to "key" for projects registered before 1.1.0. */
  authMethod?: AuthMethod;
  remoteHost: string;
  remotePort: number;
  remoteUser: string;
  remotePath: string;
  /** Destination folder for `folder` targets (local path or UNC share). */
  folderPath?: string;
  /**
   * Where releases are kept for rollback: `folder` targets, and `ssh` targets with `copy` activation.
   * Must be outside the live folder.
   */
  backupPath?: string;
  /** SSH only. Defaults to "symlink" for projects registered before 1.1.0. */
  activation?: Activation;
  /** SSH only. Defaults to "archive". */
  uploadMode?: UploadMode;
  /** Runs after a release goes live (deploy or rollback): on the server for SSH, locally for folders. */
  postDeployCommand?: string;
  buildCommand: string;
  buildPath: string;
  installCommand?: string;
  projectType: string;
  framework?: string;
  sshKey?: string;
  /** Timestamp of the last successful deploy. */
  lastDeploy?: string;
  lastDeployStatus?: DeployStatus;
  lastDeployError?: string;
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

/** Secrets supplied at deploy time by the caller (VSCode secret storage, prompt, or env vars). */
export interface Credentials {
  password?: string;
  passphrase?: string;
}

export type CredentialKind = "password" | "passphrase";

export function targetTypeOf(project: Pick<ProjectConfig, "targetType">): TargetType {
  return project.targetType ?? "ssh";
}

export function authMethodOf(project: Pick<ProjectConfig, "authMethod">): AuthMethod {
  return project.authMethod ?? "key";
}

export function activationOf(project: Pick<ProjectConfig, "activation">): Activation {
  return project.activation ?? "symlink";
}

export function uploadModeOf(project: Pick<ProjectConfig, "uploadMode">): UploadMode {
  return project.uploadMode ?? "archive";
}

/** Human-readable destination, e.g. `deploy@host:/var/www/app` or `\\server\site`. */
export function describeTarget(
  project: Pick<ProjectConfig, "targetType" | "remoteUser" | "remoteHost" | "remotePath" | "folderPath">
): string {
  if (targetTypeOf(project) === "folder") return project.folderPath ?? "";
  return `${project.remoteUser}@${project.remoteHost}:${project.remotePath}`;
}
