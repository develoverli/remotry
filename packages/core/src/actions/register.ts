import path from "path";
import os from "os";
import { store } from "../store";
import { Activation, AuthMethod, ProjectConfig, TargetType, UploadMode } from "../types";
import { defaultBackupPath, validateFolderTarget } from "../connection";
import { defaultRemoteBackupPath, validateRemoteCopyTarget } from "../remote";

const TARGET_TYPES: readonly TargetType[] = ["ssh", "folder"];
const AUTH_METHODS: readonly AuthMethod[] = ["key", "password", "agent"];
const ACTIVATIONS: readonly Activation[] = ["copy", "symlink"];
const UPLOAD_MODES: readonly UploadMode[] = ["archive", "files"];

export interface RegisterInput {
  name: string;
  localPath: string;
  /** `user@host:/path`. Required for `ssh` targets. */
  remote?: string;
  /** Defaults to "ssh". */
  targetType?: TargetType;
  /** Defaults to "key". Only used by `ssh` targets. */
  authMethod?: AuthMethod;
  /** Destination folder. Required for `folder` targets. */
  folderPath?: string;
  /** Releases location for `folder` targets and `copy` SSH targets. Defaults to a sibling `<path>.remotry-releases`. */
  backupPath?: string;
  /** SSH only. Defaults to "copy" for new projects; existing projects keep theirs. */
  activation?: Activation;
  /** SSH only. Defaults to "archive". */
  uploadMode?: UploadMode;
  /** Runs after a release goes live. Pass an empty string to clear it. */
  postDeployCommand?: string;
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

  const existing = store.getProject(input.name);
  if (existing && !input.update) {
    throw new Error(`Project "${input.name}" already exists. Pass update: true to modify.`);
  }

  const targetType = input.targetType ?? existing?.targetType ?? "ssh";
  if (!TARGET_TYPES.includes(targetType)) {
    throw new Error(`Invalid target type "${targetType}". Use one of: ${TARGET_TYPES.join(", ")}`);
  }
  const authMethod = input.authMethod ?? existing?.authMethod ?? "key";
  if (!AUTH_METHODS.includes(authMethod)) {
    throw new Error(`Invalid auth method "${authMethod}". Use one of: ${AUTH_METHODS.join(", ")}`);
  }

  // Projects registered before 1.1.0 have no activation and use the `current` symlink; keep that on update.
  const activation = input.activation ?? existing?.activation ?? (existing ? "symlink" : "copy");
  if (!ACTIVATIONS.includes(activation)) {
    throw new Error(`Invalid activation "${activation}". Use one of: ${ACTIVATIONS.join(", ")}`);
  }
  const uploadMode = input.uploadMode ?? existing?.uploadMode ?? "archive";
  if (!UPLOAD_MODES.includes(uploadMode)) {
    throw new Error(`Invalid upload mode "${uploadMode}". Use one of: ${UPLOAD_MODES.join(", ")}`);
  }
  const postDeployCommand = (input.postDeployCommand ?? existing?.postDeployCommand ?? "").trim() || undefined;

  const localPath = path.resolve(input.localPath);
  const now = new Date().toISOString();

  let remote: ParsedRemote = { user: "", host: "", path: "" };
  let folderPath: string | undefined;
  let backupPath: string | undefined;

  if (targetType === "ssh") {
    if (!input.remote) throw new Error("Remote destination is required (user@host:/path)");
    remote = parseRemote(input.remote);
    if (activation === "copy") {
      const previous = existing && (existing.targetType ?? "ssh") === "ssh" ? existing.backupPath : undefined;
      backupPath = input.backupPath || previous || defaultRemoteBackupPath(remote.path);
      validateRemoteCopyTarget(remote.path, backupPath);
    }
  } else {
    const folder = input.folderPath ?? existing?.folderPath;
    if (!folder) throw new Error("Target folder is required for folder deploys");
    folderPath = path.resolve(folder);
    const previous = existing?.targetType === "folder" ? existing.backupPath : undefined;
    backupPath = path.resolve(input.backupPath || previous || defaultBackupPath(folderPath));
    validateFolderTarget(folderPath, backupPath, localPath);
  }

  const project: ProjectConfig = {
    name: input.name,
    localPath,
    targetType,
    authMethod: targetType === "ssh" ? authMethod : undefined,
    remoteHost: remote.host,
    remotePort: input.remotePort ?? existing?.remotePort ?? 22,
    remoteUser: remote.user,
    remotePath: remote.path,
    folderPath,
    backupPath,
    activation: targetType === "ssh" ? activation : undefined,
    uploadMode: targetType === "ssh" ? uploadMode : undefined,
    postDeployCommand,
    buildCommand: input.buildCommand ?? existing?.buildCommand ?? "pnpm build",
    buildPath: input.buildPath ?? existing?.buildPath ?? "./dist",
    installCommand: input.installCommand ?? existing?.installCommand ?? "",
    projectType: input.projectType ?? existing?.projectType ?? "node",
    framework: input.framework ?? existing?.framework,
    sshKey: targetType === "ssh" && authMethod === "key" ? input.sshKey ?? existing?.sshKey ?? "" : undefined,
    lastDeploy: existing?.lastDeploy,
    lastDeployStatus: existing?.lastDeployStatus,
    lastDeployError: existing?.lastDeployError,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.addProject(project, !!input.update);
  return project;
}
