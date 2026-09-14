import fs from "fs-extra";
import os from "os";
import path from "path";

const NEXT_CONFIG_FILES = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts", "next.config.mts"];
const STANDALONE_OUTPUT = /output\s*:\s*["'`]standalone["'`]/;
// Monorepos nest server.js under the tracing root; it is never deeper than this in practice.
const SERVER_SEARCH_DEPTH = 6;

/** Whether the project's next.config sets `output: "standalone"`. */
export function usesNextStandalone(projectPath: string): boolean {
  for (const file of NEXT_CONFIG_FILES) {
    const configPath = path.join(projectPath, file);
    if (fs.existsSync(configPath) && STANDALONE_OUTPUT.test(fs.readFileSync(configPath, "utf-8"))) {
      return true;
    }
  }
  return false;
}

/** Build outputs that mean "the Next.js build": `.next` or `.next/standalone`. */
export function isNextBuildOutput(buildPath: string): boolean {
  const normalized = path.posix.normalize(buildPath.replace(/\\/g, "/")).replace(/\/+$/, "");
  return normalized === ".next" || normalized === ".next/standalone";
}

async function findServerDir(dir: string, depth = 0): Promise<string | undefined> {
  if (await fs.pathExists(path.join(dir, "server.js"))) return dir;
  if (depth >= SERVER_SEARCH_DEPTH) return undefined;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const found = await findServerDir(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return undefined;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Copy the standalone tree with real files only. Links (pnpm symlinks, or Windows junctions that
 * point at the project's full node_modules) are replaced by the traced copy of the same package
 * inside standalone when it exists, so whole packages are not pulled back in.
 */
async function copyResolvingLinks(
  source: string,
  dest: string,
  roots: { project: string; standalone: string },
  seen: Set<string>
): Promise<void> {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(source), await fs.readlink(source));
    const traced = isInside(target, roots.project) && !isInside(target, roots.standalone)
      ? path.join(roots.standalone, path.relative(roots.project, target))
      : target;
    const resolved = (await fs.pathExists(traced)) ? traced : target;
    if (!(await fs.pathExists(resolved))) return; // dangling link: nothing to ship
    const real = await fs.realpath(resolved);
    if (seen.has(real)) {
      // Already copying this directory higher up the chain; a link cycle would never end.
      return;
    }
    seen.add(real);
    try {
      await copyResolvingLinks(resolved, dest, roots, seen);
    } finally {
      seen.delete(real);
    }
    return;
  }
  if (stat.isDirectory()) {
    await fs.ensureDir(dest);
    for (const entry of await fs.readdir(source)) {
      await copyResolvingLinks(path.join(source, entry), path.join(dest, entry), roots, seen);
    }
    return;
  }
  await fs.copyFile(source, dest);
}

export interface StagedNextBuild {
  /** Temporary folder to deploy; delete it when done. */
  dir: string;
  /** Folder inside `dir` that holds server.js ("" unless the app is in a monorepo). */
  appDir: string;
}

/**
 * Next.js leaves the standalone server, the client assets, and `public` in separate places.
 * Assemble them the way Next.js documents (static and public next to server.js) in a temp folder.
 */
export async function stageNextStandalone(projectPath: string): Promise<StagedNextBuild> {
  const standalone = path.join(projectPath, ".next", "standalone");
  if (!(await fs.pathExists(standalone))) {
    throw new Error(`Next.js standalone output not found at ${standalone}. Check that the build succeeded.`);
  }
  const serverDir = await findServerDir(standalone);
  if (!serverDir) {
    throw new Error(`Next.js standalone output has no server.js in ${standalone}.`);
  }
  const appDir = path.relative(standalone, serverDir);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remotry-next-"));
  try {
    // Links inside standalone/node_modules point back to this machine; ship real files instead.
    await copyResolvingLinks(standalone, dir, { project: path.resolve(projectPath), standalone }, new Set());
    const staticDir = path.join(projectPath, ".next", "static");
    if (await fs.pathExists(staticDir)) {
      await fs.copy(staticDir, path.join(dir, appDir, ".next", "static"), { dereference: true });
    }
    const publicDir = path.join(projectPath, "public");
    if (await fs.pathExists(publicDir)) {
      await fs.copy(publicDir, path.join(dir, appDir, "public"), { dereference: true });
    }
  } catch (err) {
    await fs.remove(dir).catch(() => undefined);
    throw err;
  }
  return { dir, appDir };
}
