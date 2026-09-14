import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { create as createTar } from "tar";
import { store } from "../store";
import { DeployEvent } from "../events";
import { CredentialsRequiredError } from "../errors";
import { Credentials, ProjectConfig, targetTypeOf, uploadModeOf } from "../types";
import { connectSSH, defaultBackupPath, requiredCredential, validateFolderTarget } from "../connection";
import {
  PRE_REMOTRY_RELEASE,
  activateFolderRelease,
  copyFileInto,
  listFolderReleases,
  pruneFolderReleases,
} from "../folder";
import {
  activateRemoteRelease,
  defaultRemoteBackupPath,
  pruneRemoteReleases,
  remoteHasTar,
  remoteLayout,
  runRemotePostDeploy,
  shq,
  snapshotExistingRemote,
  validateRemoteCopyTarget,
} from "../remote";
import { SSHClient } from "../ssh";
import { StagedNextBuild, isNextBuildOutput, stageNextStandalone, usesNextStandalone } from "../nextStandalone";

const execAsync = promisify(exec);

// Install/build commands can emit large logs; the default 1 MB stdout buffer
// throws "maxBuffer exceeded" and aborts an otherwise successful deploy.
const EXEC_MAX_BUFFER = 64 * 1024 * 1024;

// Each deploy is stored as a timestamped release (remotePath/releases/<timestamp>/
// over SSH, backupPath/<timestamp>/ for folders). Older releases beyond this count
// are pruned so rollback always has recent history without unbounded disk growth.
const KEEP_RELEASES = 5;

// Failed commands keep only the end of their output: that is where tools print the actual error.
const COMMAND_OUTPUT_TAIL_LINES = 15;

/** "Command failed: <cmd>" plus the tail of stderr (or stdout, for tools that log errors there). */
function commandFailure(command: string, err: unknown): string {
  const { stderr, stdout } = (err ?? {}) as { stderr?: string; stdout?: string };
  const output = stderr?.trim() || stdout?.trim() || (err instanceof Error ? err.message : "");
  const tail = output.split(/\r?\n/).slice(-COMMAND_OUTPUT_TAIL_LINES).join("\n");
  return tail ? `Command failed: ${command}\n${tail}` : `Command failed: ${command}`;
}

function releaseTimestamp(): string {
  // Filesystem-safe, lexicographically sortable (chronological) directory name.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface DeployOptions {
  dryRun?: boolean;
  /** Secrets for password auth or passphrase-protected keys. Never persisted. */
  credentials?: Credentials;
}

interface DeployContext {
  project: ProjectConfig;
  options: DeployOptions;
  buildPath: string;
  files: string[];
  releaseName: string;
  startTime: number;
  totalSteps: number;
  currentStep: number;
}

export async function* deployProject(
  name: string,
  options: DeployOptions = {}
): AsyncGenerator<DeployEvent, void, unknown> {
  const project = store.getProject(name);
  if (!project) {
    throw new Error(`Project "${name}" not found. Use list to see registered projects.`);
  }

  // Ask for missing secrets before running a potentially long build, and never
  // record a missing secret as a failed deploy.
  if (!options.dryRun) {
    const needed = requiredCredential(project, options.credentials);
    if (needed) throw new CredentialsRequiredError(name, needed);
  }

  try {
    yield* runDeploy(project, options);
  } catch (err) {
    if (!options.dryRun && !(err instanceof CredentialsRequiredError)) {
      recordResult(name, { lastDeployStatus: "failed", lastDeployError: err instanceof Error ? err.message : "Unknown error" });
    }
    throw err;
  }
}

function recordResult(name: string, patch: Partial<ProjectConfig>): void {
  // Re-read so a long deploy never overwrites config edited in the meantime.
  const fresh = store.getProject(name);
  if (fresh) store.addProject({ ...fresh, ...patch }, true);
}

async function* runDeploy(project: ProjectConfig, options: DeployOptions): AsyncGenerator<DeployEvent, void, unknown> {
  const startTime = Date.now();
  const targetType = targetTypeOf(project);

  if (targetType === "folder") {
    if (!project.folderPath) throw new Error(`Project "${project.name}" has no target folder configured.`);
    validateFolderTarget(project.folderPath, project.backupPath || defaultBackupPath(project.folderPath), project.localPath);
  } else if (remoteLayout(project).activation === "copy") {
    validateRemoteCopyTarget(project.remotePath, project.backupPath || defaultRemoteBackupPath(project.remotePath));
  }

  const localPath = path.resolve(project.localPath);
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local path does not exist: ${localPath}`);
  }

  // install? + build + connect/prepare + upload/copy + post-deploy?
  const totalSteps = 3 + (project.installCommand ? 1 : 0) + (project.postDeployCommand ? 1 : 0);
  let currentStep = 0;

  if (project.installCommand) {
    currentStep++;
    yield { type: "step", current: currentStep, total: totalSteps, message: `Installing: ${project.installCommand}` };
    try {
      await execAsync(project.installCommand, { cwd: localPath, maxBuffer: EXEC_MAX_BUFFER });
      yield { type: "success", message: "Dependencies installed" };
    } catch (err) {
      const msg = commandFailure(project.installCommand, err);
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
    const msg = commandFailure(project.buildCommand, err);
    yield { type: "error", message: `Build failed: ${msg}` };
    throw new Error(msg);
  }

  let buildPath = path.resolve(localPath, project.buildPath);
  let staged: StagedNextBuild | undefined;
  if (isNextBuildOutput(project.buildPath) && usesNextStandalone(localPath)) {
    staged = await stageNextStandalone(localPath);
    buildPath = staged.dir;
    yield {
      type: "info",
      message: `Next.js standalone: packaged .next/standalone with .next/static and public${
        staged.appDir ? ` (server.js in ${staged.appDir.replace(/\\/g, "/")})` : ""
      }`,
    };
  } else if (!fs.existsSync(buildPath)) {
    throw new Error(`Build path does not exist after build: ${buildPath}`);
  }

  try {
    const ctx: DeployContext = {
      project,
      options,
      buildPath,
      files: walkDirFiles(buildPath),
      releaseName: releaseTimestamp(),
      startTime,
      totalSteps,
      currentStep,
    };

    if (targetType === "folder") {
      yield* deployToFolder(ctx);
    } else {
      yield* deployOverSSH(ctx);
    }
  } finally {
    if (staged) await fs.remove(staged.dir).catch(() => undefined);
  }
}

async function* deployOverSSH(ctx: DeployContext): AsyncGenerator<DeployEvent, void, unknown> {
  const { project, options, buildPath, files, releaseName, startTime, totalSteps } = ctx;
  let currentStep = ctx.currentStep;
  const layout = remoteLayout(project);
  const releasePath = `${layout.releasesDir}/${releaseName}`;
  const useArchive = uploadModeOf(project) === "archive";

  if (options.dryRun) {
    yield { type: "info", message: `DRY RUN — would deploy ${files.length} files from ${buildPath}` };
    yield { type: "info", message: `Release: ${project.remoteUser}@${project.remoteHost}:${releasePath}` };
    yield {
      type: "info",
      message:
        layout.activation === "symlink"
          ? `Would repoint ${layout.liveDir} -> ${releasePath}`
          : `Would replace the contents of ${layout.liveDir} with the release`,
    };
    yield { type: "done", durationMs: Date.now() - startTime, filesUploaded: 0 };
    return;
  }

  currentStep++;
  yield { type: "step", current: currentStep, total: totalSteps, message: "Connecting via SSH..." };

  const ssh = await connectSSH(project, options.credentials);
  try {
    yield { type: "success", message: "Connected" };

    currentStep++;
    let archiveUsed = false;
    if (useArchive) {
      if (await remoteHasTar(ssh)) {
        yield { type: "step", current: currentStep, total: totalSteps, message: `Uploading ${files.length} files as one archive...` };
        yield* uploadAsArchive(ssh, buildPath, layout.releasesDir, releasePath, releaseName);
        archiveUsed = true;
      } else {
        yield { type: "warn", message: "tar is not available on the server; uploading file by file instead." };
      }
    }
    if (!archiveUsed) {
      yield { type: "step", current: currentStep, total: totalSteps, message: `Uploading ${files.length} files...` };
      yield* uploadFileByFile(ssh, buildPath, releasePath, files.length);
    }

    if (layout.activation === "copy" && (await snapshotExistingRemote(ssh, layout))) {
      yield { type: "info", message: `Saved existing ${layout.liveDir} as release "${PRE_REMOTRY_RELEASE}"` };
    }

    const mode = await activateRemoteRelease(ssh, layout, releaseName);
    yield {
      type: "success",
      message:
        mode === "symlink"
          ? `current -> releases/${releaseName}`
          : `${layout.liveDir} now serves release ${releaseName}${mode === "sync" ? " (synced in place)" : ""}`,
    };

    // Best-effort cleanup — never fail a deploy over it.
    const pruneError = await pruneRemoteReleases(ssh, layout, KEEP_RELEASES);
    if (pruneError) yield { type: "warn", message: `Could not prune old releases: ${pruneError}` };

    // The release is live from here on, even if the post-deploy command fails.
    recordResult(project.name, { lastDeploy: new Date().toISOString() });

    if (project.postDeployCommand) {
      currentStep++;
      yield { type: "step", current: currentStep, total: totalSteps, message: `Running: ${project.postDeployCommand}` };
      const output = await runRemotePostDeploy(ssh, layout, project.postDeployCommand);
      if (output) yield { type: "info", message: output };
      yield { type: "success", message: "Post-deploy command finished" };
    }

    recordResult(project.name, { lastDeployStatus: "success", lastDeployError: undefined });
    yield { type: "success", message: `Deployed to ${project.remoteHost}:${layout.liveDir}` };
    yield { type: "done", durationMs: Date.now() - startTime, filesUploaded: files.length };
  } finally {
    ssh.disconnect();
  }
}

async function* uploadAsArchive(
  ssh: SSHClient,
  buildPath: string,
  releasesDir: string,
  releasePath: string,
  releaseName: string
): AsyncGenerator<DeployEvent, void, unknown> {
  const archiveName = `.remotry-upload-${releaseName}.tar.gz`;
  const localArchive = path.join(os.tmpdir(), archiveName);
  const remoteArchive = `${releasesDir}/${archiveName}`;
  try {
    // follow: store symlink targets as real files, since Windows links (e.g. pnpm) break on Linux.
    await createTar({ gzip: true, file: localArchive, cwd: buildPath, follow: true, portable: true }, ["."]);
    const size = (await fs.stat(localArchive)).size;
    yield { type: "info", message: `Archive ready: ${(size / 1024 / 1024).toFixed(1)} MB` };

    const mkdir = await ssh.execRemoteCommand(`mkdir -p ${shq(releasePath)}`);
    if (mkdir.code !== 0) throw new Error(mkdir.stderr.trim() || `Cannot create ${releasePath}`);

    const queue: number[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    const upload = ssh
      .uploadFile(localArchive, remoteArchive, (transferred) => {
        queue.push(transferred);
        wake?.();
        wake = null;
      })
      .finally(() => {
        finished = true;
        wake?.();
        wake = null;
      });

    let lastReported = -1;
    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => { wake = resolve; });
        continue;
      }
      const transferred = queue[queue.length - 1];
      queue.length = 0;
      // Report at most every 1%, the byte callback fires far more often than any UI needs.
      if (transferred - lastReported >= size / 100 || transferred === size) {
        lastReported = transferred;
        yield { type: "progress", current: transferred, total: size, file: archiveName, unit: "bytes" };
      }
    }
    await upload;

    // `portable` archives keep clean 755/644 modes (Windows reports 777) but store directory
    // mtimes as 0, so stamp directories with the deploy time after unpacking.
    const extract = await ssh.execRemoteCommand(
      `tar -xzf ${shq(remoteArchive)} -C ${shq(releasePath)} && find ${shq(releasePath)} -type d -exec touch {} +`
    );
    if (extract.code !== 0) throw new Error(`Could not extract the archive on the server: ${extract.stderr.trim()}`);
    yield { type: "success", message: "Archive extracted on the server" };
  } finally {
    await fs.remove(localArchive).catch(() => undefined);
    await ssh.execRemoteCommand(`rm -f ${shq(remoteArchive)}`).catch(() => undefined);
  }
}

async function* uploadFileByFile(
  ssh: SSHClient,
  buildPath: string,
  releasePath: string,
  total: number
): AsyncGenerator<DeployEvent, void, unknown> {
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
}

async function* deployToFolder(ctx: DeployContext): AsyncGenerator<DeployEvent, void, unknown> {
  const { project, options, buildPath, files, releaseName, startTime, totalSteps } = ctx;
  let currentStep = ctx.currentStep;
  const folderPath = path.resolve(project.folderPath as string);
  const backupPath = path.resolve(project.backupPath || defaultBackupPath(folderPath));
  const releaseDir = path.join(backupPath, releaseName);

  if (options.dryRun) {
    yield { type: "info", message: `DRY RUN — would copy ${files.length} files from ${buildPath}` };
    yield { type: "info", message: `Target folder: ${folderPath}` };
    yield { type: "info", message: `Release copy: ${releaseDir}` };
    yield { type: "done", durationMs: Date.now() - startTime, filesUploaded: 0 };
    return;
  }

  currentStep++;
  yield { type: "step", current: currentStep, total: totalSteps, message: `Preparing ${folderPath}` };
  await fs.ensureDir(folderPath);
  await fs.ensureDir(backupPath);

  const { current } = await listFolderReleases(backupPath);
  let restorePoint = current;
  if (!current && (await fs.readdir(folderPath)).length > 0) {
    // First Remotry deploy into a folder that already has a site: keep it so rollback can restore it.
    await fs.copy(folderPath, path.join(backupPath, PRE_REMOTRY_RELEASE));
    restorePoint = PRE_REMOTRY_RELEASE;
    yield { type: "info", message: `Saved existing folder contents as release "${PRE_REMOTRY_RELEASE}"` };
  }

  currentStep++;
  yield { type: "step", current: currentStep, total: totalSteps, message: `Copying ${files.length} files...` };
  let copied = 0;
  let activating = false;
  try {
    for (const file of files) {
      await copyFileInto(buildPath, file, releaseDir);
      copied++;
      yield { type: "progress", current: copied, total: files.length, file: file.replace(/\\/g, "/") };
    }
    activating = true;
    await activateFolderRelease(folderPath, backupPath, releaseName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Never leave a half-copied release or a half-emptied site behind.
    await fs.remove(releaseDir).catch(() => undefined);
    let restored = false;
    if (activating && restorePoint) {
      restored = await activateFolderRelease(folderPath, backupPath, restorePoint).then(() => true, () => false);
    }
    throw new Error(
      restored
        ? `Failed to update ${folderPath}: ${msg}. Restored release "${restorePoint}".`
        : `Failed to update ${folderPath}: ${msg}`
    );
  }
  yield { type: "success", message: `${folderPath} now serves release ${releaseName}` };

  try {
    await pruneFolderReleases(backupPath, KEEP_RELEASES);
  } catch (err) {
    yield { type: "warn", message: `Could not prune old releases: ${err instanceof Error ? err.message : "Unknown error"}` };
  }

  // The release is live from here on, even if the post-deploy command fails.
  recordResult(project.name, { lastDeploy: new Date().toISOString() });

  if (project.postDeployCommand) {
    currentStep++;
    yield { type: "step", current: currentStep, total: totalSteps, message: `Running: ${project.postDeployCommand}` };
    const output = await runLocalPostDeploy(project.postDeployCommand, folderPath);
    if (output) yield { type: "info", message: output };
    yield { type: "success", message: "Post-deploy command finished" };
  }

  recordResult(project.name, { lastDeployStatus: "success", lastDeployError: undefined });
  yield { type: "success", message: `Deployed to ${folderPath}` };
  yield { type: "done", durationMs: Date.now() - startTime, filesUploaded: copied };
}

/** Run the post-deploy command for a folder target on this machine, inside the target folder. */
export async function runLocalPostDeploy(command: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, { cwd, maxBuffer: EXEC_MAX_BUFFER });
    return stdout.trim().split(/\r?\n/).slice(-COMMAND_OUTPUT_TAIL_LINES).join("\n");
  } catch (err) {
    throw new Error(`Post-deploy ${commandFailure(command, err).replace(/^Command/, "command")}`);
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
