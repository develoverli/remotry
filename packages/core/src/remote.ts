import path from "path";
import { SSHClient } from "./ssh";
import { ProjectConfig, activationOf } from "./types";
import { PRE_REMOTRY_RELEASE } from "./folder";

/** Marker file in the releases directory naming the live release (copy activation). */
const CURRENT_MARKER = ".current";
const NEXT_SUFFIX = ".remotry-next";
const OLD_SUFFIX = ".remotry-old";
const RELEASES_SUFFIX = ".remotry-releases";
/** Last lines of a failed remote command worth showing to the user. */
const OUTPUT_TAIL_LINES = 15;

/** Quote a value for a POSIX shell. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function tailLines(text: string, lines = OUTPUT_TAIL_LINES): string {
  return text.trim().split(/\r?\n/).slice(-lines).join("\n");
}

function trimSlash(p: string): string {
  return p.replace(/\/+$/, "") || "/";
}

/** Default releases directory for copy activation: a sibling of the remote path. */
export function defaultRemoteBackupPath(remotePath: string): string {
  return `${trimSlash(remotePath)}${RELEASES_SUFFIX}`;
}

export function validateRemoteCopyTarget(remotePath: string, backupPath: string): void {
  const root = trimSlash(remotePath);
  const backup = trimSlash(backupPath);
  if (root === "/" || path.posix.dirname(root) === root) {
    throw new Error("Refusing to deploy to the server's root directory.");
  }
  const rel = path.posix.relative(root, backup);
  if (rel === "" || (!rel.startsWith("..") && !path.posix.isAbsolute(rel))) {
    throw new Error("Releases folder must be outside the remote path, or the app could serve old releases.");
  }
}

export interface RemoteLayout {
  activation: "copy" | "symlink";
  /** Folder the app runs from: the remote path itself, or `<remote path>/current`. */
  liveDir: string;
  releasesDir: string;
}

export function remoteLayout(project: ProjectConfig): RemoteLayout {
  const root = trimSlash(project.remotePath);
  if (activationOf(project) === "symlink") {
    return { activation: "symlink", liveDir: `${root}/current`, releasesDir: `${root}/releases` };
  }
  return { activation: "copy", liveDir: root, releasesDir: trimSlash(project.backupPath || defaultRemoteBackupPath(root)) };
}

async function run(ssh: SSHClient, command: string): Promise<string> {
  const res = await ssh.execRemoteCommand(command);
  if (res.code !== 0) {
    throw new Error(tailLines(res.stderr || res.stdout) || `Remote command failed with exit code ${res.code}`);
  }
  return res.stdout;
}

/** Release names on the server, newest first, and the live one. */
export async function listRemoteReleases(
  ssh: SSHClient,
  layout: RemoteLayout
): Promise<{ releases: string[]; current: string }> {
  const list = await ssh.execRemoteCommand(`ls -1d ${shq(layout.releasesDir)}/*/ 2>/dev/null || true`);
  const releases = list.stdout
    .split("\n")
    .map((line) => line.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((line) => line.split("/").pop() as string)
    .sort()
    .reverse();

  const currentCmd =
    layout.activation === "symlink"
      ? `readlink ${shq(layout.liveDir)} 2>/dev/null || true`
      : `cat ${shq(`${layout.releasesDir}/${CURRENT_MARKER}`)} 2>/dev/null || true`;
  const current = (await ssh.execRemoteCommand(currentCmd)).stdout.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  return { releases, current };
}

/** Keep whatever was in the remote path before the first copy-activation deploy, so rollback can restore it. */
export async function snapshotExistingRemote(ssh: SSHClient, layout: RemoteLayout): Promise<boolean> {
  const snapshot = `${layout.releasesDir}/${PRE_REMOTRY_RELEASE}`;
  const marker = `${layout.releasesDir}/${CURRENT_MARKER}`;
  // Only before the very first deploy: once a release has gone live, the folder is Remotry's own output.
  const res = await ssh.execRemoteCommand(
    `if [ ! -e ${shq(marker)} ] && [ ! -e ${shq(snapshot)} ] && [ -d ${shq(layout.liveDir)} ] && [ -n "$(ls -A ${shq(layout.liveDir)} 2>/dev/null)" ]; then ` +
      `cp -a ${shq(layout.liveDir)} ${shq(snapshot)} && echo saved; fi`
  );
  if (res.code !== 0) throw new Error(tailLines(res.stderr) || "Could not snapshot the existing remote folder.");
  return res.stdout.includes("saved");
}

/**
 * Make a stored release live.
 * Symlink: repoint `current`. Copy: stage a copy next to the remote path and swap it in with two
 * renames (no mixed files); without write access to the parent folder, sync the files in place.
 * Returns how the release was activated, for logging.
 */
export async function activateRemoteRelease(
  ssh: SSHClient,
  layout: RemoteLayout,
  release: string
): Promise<"symlink" | "swap" | "sync"> {
  const source = `${layout.releasesDir}/${release}`;
  if (layout.activation === "symlink") {
    await run(ssh, `ln -sfn ${shq(source)} ${shq(layout.liveDir)}`);
    return "symlink";
  }

  const live = layout.liveDir;
  const next = `${live}${NEXT_SUFFIX}`;
  const old = `${live}${OLD_SUFFIX}`;
  const parentWritable = (await ssh.execRemoteCommand(`test -w "$(dirname ${shq(live)})"`)).code === 0;

  let mode: "swap" | "sync";
  if (parentWritable) {
    await run(
      ssh,
      `rm -rf ${shq(next)} ${shq(old)} && cp -a ${shq(source)} ${shq(next)} && ` +
        `if [ -e ${shq(live)} ]; then mv ${shq(live)} ${shq(old)}; fi && mv ${shq(next)} ${shq(live)} && rm -rf ${shq(old)}`
    );
    mode = "swap";
  } else {
    await run(
      ssh,
      `mkdir -p ${shq(live)} && if command -v rsync >/dev/null 2>&1; then rsync -a --delete ${shq(`${source}/`)} ${shq(`${live}/`)}; ` +
        `else find ${shq(live)} -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -a ${shq(`${source}/.`)} ${shq(`${live}/`)}; fi`
    );
    mode = "sync";
  }
  await run(ssh, `printf '%s' ${shq(release)} > ${shq(`${layout.releasesDir}/${CURRENT_MARKER}`)}`);
  return mode;
}

/** Delete releases beyond `keep`, never the live one. Returns an error message, if any. */
export async function pruneRemoteReleases(ssh: SSHClient, layout: RemoteLayout, keep: number): Promise<string | undefined> {
  const { releases, current } = await listRemoteReleases(ssh, layout);
  const removable = releases.slice(keep).filter((r) => r !== current);
  if (removable.length === 0) return undefined;
  const res = await ssh.execRemoteCommand(`rm -rf ${removable.map((r) => shq(`${layout.releasesDir}/${r}`)).join(" ")}`);
  return res.code === 0 ? undefined : tailLines(res.stderr) || "Could not prune old releases.";
}

export async function remoteHasTar(ssh: SSHClient): Promise<boolean> {
  return (await ssh.execRemoteCommand("command -v tar >/dev/null 2>&1")).code === 0;
}

/** Run the post-deploy command in the live folder. Throws with the command's output on failure. */
export async function runRemotePostDeploy(ssh: SSHClient, layout: RemoteLayout, command: string): Promise<string> {
  const res = await ssh.execRemoteCommand(`cd ${shq(layout.liveDir)} && ${command}`);
  if (res.code !== 0) {
    const output = tailLines(res.stderr || res.stdout);
    throw new Error(`Post-deploy command failed (exit ${res.code}): ${command}${output ? `\n${output}` : ""}`);
  }
  return tailLines(res.stdout);
}
