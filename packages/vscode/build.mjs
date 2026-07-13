import { build } from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

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
