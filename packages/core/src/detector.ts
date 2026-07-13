import fs from "fs-extra";
import path from "path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface DetectedProject {
  type: string;
  framework: string | null;
  buildCommand: string;
  buildPath: string;
  installCommand: string;
  packageManager?: PackageManager;
}

export function detectPackageManager(projectPath: string): PackageManager {
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(projectPath, "package-lock.json"))) return "npm";
  return "pnpm";
}

export function pmCommands(pm: PackageManager): { install: string; build: string } {
  switch (pm) {
    case "npm":
      return { install: "npm install", build: "npm run build" };
    case "yarn":
      return { install: "yarn install", build: "yarn build" };
    case "bun":
      return { install: "bun install", build: "bun run build" };
    case "pnpm":
    default:
      return { install: "pnpm install", build: "pnpm build" };
  }
}

const PROJECT_SIGNATURES: Array<{
  key: string;
  type: string;
  framework: string | null;
  buildCommand: string;
  buildPath: string;
  installCommand: string;
}> = [
  {
    key: "package.json",
    type: "node",
    framework: null,
    buildCommand: "pnpm build",
    buildPath: "./dist",
    installCommand: "pnpm install",
  },
  {
    key: "package.json",
    type: "node",
    framework: "next",
    buildCommand: "pnpm build",
    buildPath: "./.next",
    installCommand: "pnpm install",
  },
  {
    key: "package.json",
    type: "node",
    framework: "nuxt",
    buildCommand: "pnpm build",
    buildPath: ".output",
    installCommand: "pnpm install",
  },
  {
    key: "package.json",
    type: "node",
    framework: "remix",
    buildCommand: "pnpm build",
    buildPath: "./build",
    installCommand: "pnpm install",
  },
  {
    key: "package.json",
    type: "node",
    framework: "vite",
    buildCommand: "pnpm build",
    buildPath: "./dist",
    installCommand: "pnpm install",
  },
  {
    key: "package.json",
    type: "node",
    framework: "angular",
    buildCommand: "ng build",
    buildPath: "./dist",
    installCommand: "pnpm install",
  },
  {
    key: "pyproject.toml",
    type: "python",
    framework: null,
    buildCommand: "pip install -e .",
    buildPath: "./dist",
    installCommand: "pip install",
  },
  {
    key: "requirements.txt",
    type: "python",
    framework: null,
    buildCommand: "pip install -r requirements.txt",
    buildPath: "./dist",
    installCommand: "pip install -r requirements.txt",
  },
  {
    key: "Cargo.toml",
    type: "rust",
    framework: null,
    buildCommand: "cargo build --release",
    buildPath: "./target/release",
    installCommand: "cargo build --release",
  },
  {
    key: "go.mod",
    type: "go",
    framework: null,
    buildCommand: "go build -o app",
    buildPath: "./app",
    installCommand: "go mod download",
  },
  {
    key: "Dockerfile",
    type: "docker",
    framework: null,
    buildCommand: "docker build -t app .",
    buildPath: "./",
    installCommand: "",
  },
  {
    key: "composer.json",
    type: "php",
    framework: null,
    buildCommand: "composer install --no-dev",
    buildPath: "./",
    installCommand: "composer install",
  },
];

export function detectProjectType(projectPath: string): DetectedProject | null {
  if (!fs.existsSync(projectPath)) {
    return null;
  }

  // Check for Next.js first (special case: .next folder + next.config.js)
  const hasNextConfig = fs.existsSync(path.join(projectPath, "next.config.js")) ||
                        fs.existsSync(path.join(projectPath, "next.config.mjs")) ||
                        fs.existsSync(path.join(projectPath, "next.config.ts"));
  const hasDistDir = fs.existsSync(path.join(projectPath, "dist"));
  const hasNextDir = fs.existsSync(path.join(projectPath, ".next"));
  const hasOutputDir = fs.existsSync(path.join(projectPath, "output"));
  const hasTargetRelease = fs.existsSync(path.join(projectPath, "target", "release"));

  // Check package.json for frameworks
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};
      const pm = detectPackageManager(projectPath);
      const cmds = pmCommands(pm);

      // Detect Next.js
      if (pkg.dependencies?.next || pkg.devDependencies?.next || scripts.next) {
        return {
          type: "node",
          framework: "next",
          buildCommand: cmds.build,
          buildPath: ".next",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Detect Nuxt
      if (pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt || scripts.nuxt) {
        return {
          type: "node",
          framework: "nuxt",
          buildCommand: cmds.build,
          buildPath: ".output",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Detect Vite (only on an actual vite dependency — a generic "dev"
      // script is not a reliable signal and misclassifies non-Vite projects)
      if (pkg.dependencies?.vite || pkg.devDependencies?.vite) {
        return {
          type: "node",
          framework: "vite",
          buildCommand: cmds.build,
          buildPath: "./dist",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Detect Angular
      if (pkg.dependencies?.["@angular/core"] || pkg.devDependencies?.["@angular/core"]) {
        return {
          type: "node",
          framework: "angular",
          buildCommand: scripts.build ? cmds.build : "ng build",
          buildPath: "./dist",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Detect Remix
      if (pkg.dependencies?.["@remix-run/react"] || pkg.devDependencies?.["@remix-run/react"]) {
        return {
          type: "node",
          framework: "remix",
          buildCommand: cmds.build,
          buildPath: "./build",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Default Node.js
      if (scripts.build) {
        return {
          type: "node",
          framework: null,
          buildCommand: cmds.build,
          buildPath: "./dist",
          installCommand: cmds.install,
          packageManager: pm,
        };
      }

      // Generic Node.js (no build script)
      return {
        type: "node",
        framework: null,
        buildCommand: cmds.install,
        buildPath: "./",
        installCommand: cmds.install,
        packageManager: pm,
      };
    } catch {
      // continue to other checks
    }
  }

  // Check for Python
  if (fs.existsSync(path.join(projectPath, "pyproject.toml"))) {
    return {
      type: "python",
      framework: null,
      buildCommand: "pip install -e .",
      buildPath: "./dist",
      installCommand: "pip install",
    };
  }

  if (fs.existsSync(path.join(projectPath, "requirements.txt"))) {
    return {
      type: "python",
      framework: null,
      buildCommand: "pip install -r requirements.txt",
      buildPath: "./",
      installCommand: "pip install -r requirements.txt",
    };
  }

  // Check for Rust
  if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) {
    return {
      type: "rust",
      framework: null,
      buildCommand: "cargo build --release",
      buildPath: "./target/release",
      installCommand: "cargo build --release",
    };
  }

  // Check for Go
  if (fs.existsSync(path.join(projectPath, "go.mod"))) {
    return {
      type: "go",
      framework: null,
      buildCommand: "go build -o app",
      buildPath: "./app",
      installCommand: "go mod download",
    };
  }

  // Check for Docker
  if (fs.existsSync(path.join(projectPath, "Dockerfile"))) {
    return {
      type: "docker",
      framework: null,
      buildCommand: "docker build -t app .",
      buildPath: "./",
      installCommand: "",
    };
  }

  // Check for PHP/Composer
  if (fs.existsSync(path.join(projectPath, "composer.json"))) {
    return {
      type: "php",
      framework: null,
      buildCommand: "composer install --no-dev",
      buildPath: "./",
      installCommand: "composer install",
    };
  }

  return null;
}

export function getProjectDisplayName(detected: DetectedProject): string {
  if (detected.framework) {
    return `${detected.type}/${detected.framework}`;
  }
  return detected.type;
}