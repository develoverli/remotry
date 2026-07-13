import { store } from "../store";
import { SSHClient } from "../ssh";

export interface RollbackOptions {
  /** Roll back to this specific release name (see `list`). */
  version?: string;
  /** List available releases instead of rolling back. */
  list?: boolean;
}

export interface RollbackResult {
  available: boolean;
  output: string;
}

/** Parse a newline-separated list of release directories into names, newest first. */
function parseReleases(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim().replace(/\/+$/, ""))
    .filter((line) => line.length > 0 && !line.includes("*"))
    .map((line) => line.split("/").pop() as string);
}

/** Basename of the release the `current` symlink points at, or "" if none. */
function currentReleaseName(readlinkStdout: string): string {
  const target = readlinkStdout.trim().replace(/\/+$/, "");
  return target ? (target.split("/").pop() as string) : "";
}

export async function rollbackProject(name: string, options: RollbackOptions = {}): Promise<RollbackResult> {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found.`);
  }

  const remoteRoot = project.remotePath.replace(/\/+$/, "");
  const releasesDir = `${remoteRoot}/releases`;
  const currentLink = `${remoteRoot}/current`;

  const ssh = new SSHClient();
  try {
    await ssh.connect({
      host: project.remoteHost,
      port: project.remotePort,
      username: project.remoteUser,
      privateKey: project.sshKey || undefined,
    });

    const listRes = await ssh.execRemoteCommand(`ls -1dt "${releasesDir}"/*/ 2>/dev/null || true`);
    const releases = parseReleases(listRes.stdout);

    if (releases.length === 0) {
      return { available: false, output: "No releases found on the remote. Deploy at least once first." };
    }

    const curRes = await ssh.execRemoteCommand(`readlink "${currentLink}" 2>/dev/null || true`);
    const current = currentReleaseName(curRes.stdout);

    if (options.list) {
      const lines = releases.map((r) => `${r === current ? "* " : "  "}${r}`);
      return { available: true, output: lines.join("\n") };
    }

    let target: string;
    if (options.version) {
      if (!releases.includes(options.version)) {
        return { available: false, output: `Release "${options.version}" not found. Use --list to see available releases.` };
      }
      target = options.version;
    } else {
      // releases are newest-first, so the entry after the current one is the previous deploy.
      const currentIdx = current ? releases.indexOf(current) : -1;
      const previousIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
      if (previousIdx >= releases.length) {
        return { available: false, output: "No previous release to roll back to." };
      }
      target = releases[previousIdx];
    }

    const swap = await ssh.execRemoteCommand(`ln -sfn "${releasesDir}/${target}" "${currentLink}"`);
    if (swap.code !== 0) {
      return { available: false, output: swap.stderr.trim() || "Failed to update the 'current' symlink." };
    }

    return { available: true, output: `Rolled back "${name}" — current -> ${target}` };
  } finally {
    ssh.disconnect();
  }
}
