import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import path from "path";
import { store } from "../store";
import { SSHClient } from "../ssh";
import { DeployEvent } from "../events";

const execAsync = promisify(exec);

// Install/build commands can emit large logs; the default 1 MB stdout buffer
// throws "maxBuffer exceeded" and aborts an otherwise successful deploy.
const EXEC_MAX_BUFFER = 64 * 1024 * 1024;

// Each deploy uploads into remotePath/releases/<timestamp>/ and repoints the
// remotePath/current symlink at it. Older releases beyond this count are pruned
// so rollback always has recent history without unbounded disk growth.
const KEEP_RELEASES = 5;

function releaseTimestamp(): string {
  // Filesystem-safe, lexicographically sortable (chronological) directory name.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface DeployOptions {
  dryRun?: boolean;
}

export async function* deployProject(
  name: string,
  options: DeployOptions = {}
): AsyncGenerator<DeployEvent, void, unknown> {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found. Use list to see registered projects.`);
  }

  const startTime = Date.now();

  const localPath = path.resolve(project.localPath);
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local path does not exist: ${localPath}`);
  }

  const totalSteps = project.installCommand ? 4 : 3;
  let currentStep = 0;

  if (project.installCommand) {
    currentStep++;
    yield { type: "step", current: currentStep, total: totalSteps, message: `Installing: ${project.installCommand}` };
    try {
      await execAsync(project.installCommand, { cwd: localPath, maxBuffer: EXEC_MAX_BUFFER });
      yield { type: "success", message: "Dependencies installed" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      yield { type: "error", message: `Install failed: ${msg}` };
      throw new Error(msg);
    }
  }

  currentStep++;
  yield { type: "step", current: currentStep, total: totalSteps, message: `Building: ${project.buildCommand}` };
  try {
    await execAsync(project.buildCommand, { cwd: localPath, maxBuffer: EXEC_MAX_BUFFER });
    yield { type: "success", message: "Build completed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    yield { type: "error", message: `Build failed: ${msg}` };
    throw new Error(msg);
  }

  const buildPath = path.resolve(localPath, project.buildPath);
  if (!fs.existsSync(buildPath)) {
    throw new Error(`Build path does not exist after build: ${buildPath}`);
  }

  const files = walkDirFiles(buildPath);
  const total = files.length;

  const remoteRoot = project.remotePath.replace(/\/+$/, "");
  const releasesDir = `${remoteRoot}/releases`;
  const releaseName = releaseTimestamp();
  const releasePath = `${releasesDir}/${releaseName}`;
  const currentLink = `${remoteRoot}/current`;

  if (options.dryRun) {
    yield { type: "info", message: `DRY RUN — would deploy ${total} files from ${buildPath}` };
    yield { type: "info", message: `Target: ${project.remoteUser}@${project.remoteHost}:${releasePath}` };
    yield { type: "info", message: `Would repoint ${currentLink} -> releases/${releaseName}` };
    yield { type: "done", durationMs: Date.now() - startTime, filesUploaded: 0 };
    return;
  }

  currentStep++;
  yield { type: "step", current: currentStep, total: totalSteps, message: "Connecting via SSH..." };

  const ssh = new SSHClient();
  try {
    await ssh.connect({
      host: project.remoteHost,
      port: project.remotePort,
      username: project.remoteUser,
      privateKey: project.sshKey || undefined,
    });
    yield { type: "success", message: "Connected" };

    currentStep++;
    yield { type: "step", current: currentStep, total: totalSteps, message: `Uploading ${total} files...` };

    let uploaded = 0;
    const progressQueue: { file: string; current: number }[] = [];
    let progressResolver: (() => void) | null = null;

    const uploadPromise = ssh.uploadDir(buildPath, releasePath, (file) => {
      uploaded++;
      progressQueue.push({ file, current: uploaded });
      if (progressResolver) {
        progressResolver();
        progressResolver = null;
      }
    });

    let uploadDone = false;
    uploadPromise.finally(() => {
      uploadDone = true;
      if (progressResolver) {
        progressResolver();
        progressResolver = null;
      }
    });

    while (!uploadDone || progressQueue.length > 0) {
      if (progressQueue.length === 0 && !uploadDone) {
        await new Promise<void>((resolve) => { progressResolver = resolve; });
        continue;
      }
      const item = progressQueue.shift();
      if (item) {
        yield { type: "progress", current: item.current, total, file: item.file };
      }
    }

    await uploadPromise;

    // Atomically repoint the "current" symlink at the new release.
    // `ln -sfn` replaces an existing symlink without dereferencing it.
    const swap = await ssh.execRemoteCommand(`ln -sfn "${releasePath}" "${currentLink}"`);
    if (swap.code !== 0) {
      throw new Error(swap.stderr.trim() || "Failed to update the 'current' symlink on the remote.");
    }
    yield { type: "success", message: `current -> releases/${releaseName}` };

    // Prune old releases beyond KEEP_RELEASES (best-effort — never fail a deploy over cleanup).
    const prune = await ssh.execRemoteCommand(
      `cd "${releasesDir}" && ls -1dt */ 2>/dev/null | tail -n +${KEEP_RELEASES + 1} | xargs -r rm -rf`
    );
    if (prune.code !== 0 && prune.stderr.trim()) {
      yield { type: "warn", message: `Could not prune old releases: ${prune.stderr.trim()}` };
    }

    project.lastDeploy = new Date().toISOString();
    store.addProject(project, true);

    const durationMs = Date.now() - startTime;
    yield { type: "success", message: `Deployed to ${project.remoteHost}:${currentLink}` };
    yield { type: "done", durationMs, filesUploaded: uploaded };
  } finally {
    ssh.disconnect();
  }
}

function walkDirFiles(dir: string, base?: string): string[] {
  const files: string[] = [];
  const basePath = base || dir;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...walkDirFiles(fullPath, basePath));
      } else {
        files.push(path.relative(basePath, fullPath));
      }
    }
  } catch {
    // ignore
  }
  return files;
}
