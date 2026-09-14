import fs from "fs-extra";
import path from "path";

/** Marker file inside the backup path naming the release currently copied into the target folder. */
const CURRENT_MARKER = ".current";

/**
 * Snapshot of whatever was in the target folder before Remotry first deployed to it.
 * Sorts before any ISO timestamp, so it always counts as the oldest release.
 */
export const PRE_REMOTRY_RELEASE = "0000-pre-remotry";

export interface FolderReleases {
  /** Release names, newest first. */
  releases: string[];
  current: string;
}

export async function listFolderReleases(backupPath: string): Promise<FolderReleases> {
  if (!(await fs.pathExists(backupPath))) return { releases: [], current: "" };
  const entries = await fs.readdir(backupPath, { withFileTypes: true });
  const releases = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  const markerPath = path.join(backupPath, CURRENT_MARKER);
  const current = (await fs.pathExists(markerPath)) ? (await fs.readFile(markerPath, "utf-8")).trim() : "";
  return { releases, current };
}

export async function setFolderCurrent(backupPath: string, release: string): Promise<void> {
  await fs.writeFile(path.join(backupPath, CURRENT_MARKER), release, "utf-8");
}

/** Replace the target folder's contents with a stored release. */
export async function activateFolderRelease(folderPath: string, backupPath: string, release: string): Promise<void> {
  const source = path.join(backupPath, release);
  if (!(await fs.pathExists(source))) throw new Error(`Release "${release}" not found in ${backupPath}`);
  await fs.ensureDir(folderPath);
  await fs.emptyDir(folderPath);
  await fs.copy(source, folderPath);
  await setFolderCurrent(backupPath, release);
}

/** Delete releases beyond `keep`, never touching the current one. Returns the names removed. */
export async function pruneFolderReleases(backupPath: string, keep: number): Promise<string[]> {
  const { releases, current } = await listFolderReleases(backupPath);
  const removable = releases.slice(keep).filter((r) => r !== current);
  for (const release of removable) {
    await fs.remove(path.join(backupPath, release));
  }
  return removable;
}

/** Copy one file, creating parent directories as needed. */
export async function copyFileInto(sourceRoot: string, relativeFile: string, destRoot: string): Promise<void> {
  const dest = path.join(destRoot, relativeFile);
  await fs.ensureDir(path.dirname(dest));
  await fs.copyFile(path.join(sourceRoot, relativeFile), dest);
}
