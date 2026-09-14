import fs from "fs-extra";
import path from "path";
import { utils as sshUtils } from "ssh2";
import { SSHClient, SSHConfig, resolveHome } from "./ssh";
import { AuthenticationError, CredentialsRequiredError } from "./errors";
import { Credentials, CredentialKind, ProjectConfig, activationOf, authMethodOf, targetTypeOf } from "./types";
import { defaultRemoteBackupPath, shq } from "./remote";

/** OpenSSH for Windows exposes its agent on this named pipe. */
const WINDOWS_OPENSSH_AGENT_PIPE = "\\\\.\\pipe\\openssh-ssh-agent";

const ENV_PREFIX = "REMOTRY_";

/** The subset of project config needed to reach a target, so unsaved form data can be tested too. */
export type ConnectionTarget = Pick<
  ProjectConfig,
  | "name"
  | "targetType"
  | "authMethod"
  | "remoteHost"
  | "remotePort"
  | "remoteUser"
  | "remotePath"
  | "sshKey"
  | "folderPath"
  | "backupPath"
  | "activation"
>;

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/** Agent socket to use: `SSH_AUTH_SOCK` when set, otherwise the OpenSSH named pipe on Windows. */
export function resolveAgentSocket(): string | undefined {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK;
  if (process.platform === "win32") return WINDOWS_OPENSSH_AGENT_PIPE;
  return undefined;
}

function envSuffix(projectName: string): string {
  return projectName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Env var names checked for a secret, most specific first: `REMOTRY_PASSWORD_MY_APP`, then `REMOTRY_PASSWORD`. */
export function credentialEnvVarNames(projectName: string, kind: CredentialKind): string[] {
  const base = `${ENV_PREFIX}${kind.toUpperCase()}`;
  const suffix = envSuffix(projectName);
  return suffix ? [`${base}_${suffix}`, base] : [base];
}

/** Read credentials for a project from environment variables (useful for CI). */
export function credentialsFromEnv(projectName: string): Credentials {
  const read = (kind: CredentialKind): string | undefined => {
    for (const name of credentialEnvVarNames(projectName, kind)) {
      const value = process.env[name];
      if (value) return value;
    }
    return undefined;
  };
  return { password: read("password"), passphrase: read("passphrase") };
}

function readKey(keyPath: string): Buffer {
  const resolved = resolveHome(keyPath);
  try {
    return fs.readFileSync(resolved);
  } catch (err) {
    throw new Error(`Cannot read SSH key from ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function keyNeedsPassphrase(key: Buffer): boolean {
  const parsed = sshUtils.parseKey(key);
  return parsed instanceof Error && /passphrase/i.test(parsed.message);
}

/**
 * Which secret, if any, the target still needs given the credentials on hand.
 * Callers use this to prompt before a long build instead of failing after it.
 */
export function requiredCredential(target: ConnectionTarget, credentials: Credentials = {}): CredentialKind | null {
  if (targetTypeOf(target) !== "ssh") return null;
  const method = authMethodOf(target);
  if (method === "password") return credentials.password ? null : "password";
  if (method === "key" && target.sshKey && !credentials.passphrase) {
    const resolved = resolveHome(target.sshKey);
    if (fs.existsSync(resolved) && keyNeedsPassphrase(fs.readFileSync(resolved))) return "passphrase";
  }
  return null;
}

/** Build the ssh2 connection config for a target, validating credentials up front. */
export function buildSSHConfig(target: ConnectionTarget, credentials: Credentials = {}): SSHConfig {
  const base = { host: target.remoteHost, port: target.remotePort, username: target.remoteUser };
  const method = authMethodOf(target);

  if (method === "agent") {
    const agent = resolveAgentSocket();
    if (!agent) {
      throw new AuthenticationError("No ssh-agent found. Start ssh-agent and set SSH_AUTH_SOCK.", "agent");
    }
    return { ...base, agent };
  }

  if (method === "password") {
    if (!credentials.password) throw new CredentialsRequiredError(target.name, "password");
    return { ...base, password: credentials.password };
  }

  if (!target.sshKey) return base;
  const key = readKey(target.sshKey);
  if (keyNeedsPassphrase(key)) {
    if (!credentials.passphrase) throw new CredentialsRequiredError(target.name, "passphrase");
    const parsed = sshUtils.parseKey(key, credentials.passphrase);
    if (parsed instanceof Error) {
      throw new AuthenticationError(`Wrong passphrase for SSH key ${target.sshKey}`, "passphrase");
    }
  }
  return { ...base, privateKey: target.sshKey, passphrase: credentials.passphrase };
}

export async function connectSSH(target: ConnectionTarget, credentials: Credentials = {}): Promise<SSHClient> {
  const ssh = new SSHClient();
  await ssh.connect(buildSSHConfig(target, credentials));
  return ssh;
}

/**
 * Connect and disconnect to confirm credentials before a long build.
 * Throws `CredentialsRequiredError` or `AuthenticationError`; no-op for folder targets.
 */
export async function verifyCredentials(target: ConnectionTarget, credentials: Credentials = {}): Promise<void> {
  if (targetTypeOf(target) !== "ssh") return;
  const ssh = await connectSSH(target, credentials);
  ssh.disconnect();
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Default rollback copies location for a folder target: a sibling folder, outside the web root. */
export function defaultBackupPath(folderPath: string): string {
  return `${path.resolve(folderPath).replace(/[\\/]+$/, "")}.remotry-releases`;
}

/** Reject folder layouts that would expose backups or overwrite the project itself. */
export function validateFolderTarget(folderPath: string, backupPath: string, localPath?: string): void {
  const folder = path.resolve(folderPath);
  const backup = path.resolve(backupPath);
  if (path.parse(folder).root === folder) {
    throw new Error(`Refusing to deploy to a drive or share root: ${folder}`);
  }
  if (isInside(backup, folder)) {
    throw new Error("Backup path must be outside the target folder, or the web server could expose old releases.");
  }
  if (isInside(folder, backup)) {
    throw new Error("Target folder must not be inside the backup path.");
  }
  if (localPath && isInside(path.resolve(localPath), folder)) {
    throw new Error("Target folder must not contain the local project.");
  }
}

async function nearestWritable(dir: string): Promise<string | null> {
  let current = path.resolve(dir);
  for (;;) {
    if (await fs.pathExists(current)) {
      try {
        await fs.access(current, fs.constants.W_OK);
        return current;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Check that a target is reachable and writable without changing anything on it. */
export async function testConnection(
  target: ConnectionTarget,
  credentials: Credentials = {}
): Promise<ConnectionTestResult> {
  try {
    if (targetTypeOf(target) === "folder") {
      if (!target.folderPath) return { ok: false, message: "Folder path is required." };
      const backupPath = target.backupPath || defaultBackupPath(target.folderPath);
      validateFolderTarget(target.folderPath, backupPath);
      if (!(await nearestWritable(target.folderPath))) {
        return { ok: false, message: `No write access to ${target.folderPath}` };
      }
      if (!(await nearestWritable(backupPath))) {
        return { ok: false, message: `No write access to backup path ${backupPath}` };
      }
      return { ok: true, message: `Folder ${target.folderPath} is writable.` };
    }

    const ssh = await connectSSH(target, credentials);
    try {
      const remote = target.remotePath.replace(/\/+$/, "") || "/";
      const writable = async (dir: string) =>
        (
          await ssh.execRemoteCommand(
            `d=${shq(dir)}; while [ ! -e "$d" ] && [ "$d" != "/" ]; do d=$(dirname "$d"); done; test -w "$d"`
          )
        ).code === 0;
      if (!(await writable(remote))) {
        return { ok: false, message: `Connected, but ${target.remoteUser} cannot write to ${remote}` };
      }
      if (activationOf({ activation: target.activation }) === "copy") {
        const releases = target.backupPath || defaultRemoteBackupPath(remote);
        if (!(await writable(releases))) {
          return { ok: false, message: `Connected, but ${target.remoteUser} cannot write to the releases folder ${releases}` };
        }
      }
      return { ok: true, message: `Connected to ${target.remoteHost} and ${remote} is writable.` };
    } finally {
      ssh.disconnect();
    }
  } catch (err) {
    if (err instanceof CredentialsRequiredError) throw err;
    return { ok: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}
