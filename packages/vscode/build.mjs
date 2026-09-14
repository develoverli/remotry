import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// The sidebar webview loads VSCode's icon font from the extension itself;
// node_modules is not shipped in the .vsix, so copy the two files into out/.
const require = createRequire(import.meta.url);
const codiconsDist = dirname(require.resolve("@vscode/codicons/dist/codicon.css"));
const codiconsOut = join("out", "codicons");
mkdirSync(codiconsOut, { recursive: true });
for (const file of ["codicon.css", "codicon.ttf"]) {
  copyFileSync(join(codiconsDist, file), join(codiconsOut, file));
}

const ctx = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: "out/extension.js",
  external: ["vscode", "cpu-features"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

if (watch) {
  const esbuild = await import("esbuild");
  const ctx2 = await esbuild.context(ctx);
  await ctx2.watch();
  console.log("Watching...");
} else {
  await build(ctx);
}
