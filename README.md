# Remotry

> **Deploy any project to a remote server over SSH/SFTP — from your terminal or from VSCode.**

[![CI](https://github.com/develoverli/remotry/actions/workflows/ci.yml/badge.svg)](https://github.com/develoverli/remotry/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@develoverli/remotry-cli.svg)](https://www.npmjs.com/package/@develoverli/remotry-cli)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/develoverli.remotry?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io/workspaces)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

Remotry builds your project locally and ships the build output to a remote
server over SSH/SFTP — no `rsync` or `scp` binary required. It auto-detects your
stack and package manager, remembers your projects, and works from either the
command line or a VSCode panel.

## Packages

This is a pnpm workspace with three packages:

| Package | Purpose |
|---------|---------|
| [`@develoverli/remotry-core`](packages/core/) | Pure deployment logic — no CLI or UI dependency, framework-agnostic |
| [`@develoverli/remotry-cli`](packages/cli/) | Commander-based CLI — installs the `remotry` binary |
| [`remotry`](packages/vscode/) | [VSCode extension](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry) — sidebar tree, WebView register form, in-process deploy (no subprocess spawn) |

## Features

- **Auto-detect** project type and package manager (`pnpm` / `npm` / `yarn` / `bun`) from your lockfile
- **SSH/SFTP upload** via `ssh2` — pure JavaScript, no external binary
- **Interactive wizard** (`remotry init`) for first-time setup
- **In-process deploy from VSCode** — the extension imports `@develoverli/remotry-core` directly, no shelling out
- **Per-workspace `.deployrc`** (commit-friendly) or a global registry at `~/.remotry/projects.json`
- **Dry-run** to preview a deploy without uploading
- **Multi-project deploy** — deploy everything at once, in parallel or sequentially

## Install

### CLI (from npm)

```bash
npm install -g @develoverli/remotry-cli
# or: pnpm add -g @develoverli/remotry-cli

remotry --version
remotry init                     # interactive setup wizard
remotry deploy <name>            # build + ship
```

> **Migrating from `remotry-cli` / `remotry-core`?** The unscoped packages are no
> longer maintained (last version `1.0.2`). Uninstall them and install the
> `@develoverli/*` packages — the `remotry` command stays the same.

### VSCode extension

Install **Remotry Deploy** from the
[VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry),
or from the editor:

```
ext install develoverli.remotry
```

The extension imports `@develoverli/remotry-core` and deploys **in-process** — no CLI install
and no subprocess spawn. After installing, reload VSCode and click the **Remotry
icon** (server with an upload arrow) in the activity bar to open the **Deploy Projects** panel: register a
project in a form, then deploy it with one click. It shares the same
`~/.remotry/projects.json` registry as the CLI, so projects show up in both.

You can also build the `.vsix` from source (see [Development](#development)).

## CLI commands

| Command | Description |
|---------|-------------|
| `init [name]` | Interactive setup wizard |
| `register <name> [options]` | Register/update a project without prompts |
| `deploy <name>` | Build and SFTP-upload the build output |
| `deploy <name> --dry-run` | Show what would be deployed, without uploading |
| `deploy-all [--filter <pattern>] [--sequential]` | Deploy every registered project |
| `list [--json]` | List registered projects |
| `status <name>` | Show config and last-deploy time |
| `update <name>` | Print the current config (use `register --update` to change it) |
| `remove <name>` | Unregister a project |
| `rollback <name>` | Repoint `current` to the previous release |
| `rollback <name> --list` | List releases on the remote (`*` marks the live one) |
| `rollback <name> --version <name>` | Repoint `current` to a specific release |

### `register` options

| Flag | Description | Default |
|------|-------------|---------|
| `--local <path>` | Local project path | `.` |
| `--remote <path>` | Remote destination as `user@host:/path` | — (required) |
| `--build-command <cmd>` | Build command | `pnpm build` |
| `--build-path <path>` | Build output directory to upload | `./dist` |
| `--install-command <cmd>` | Install command run before build | *(none)* |
| `--type <type>` | Project type (`node`, `python`, `rust`, `go`, `docker`, `php`) | `node` |
| `--framework <name>` | Framework hint (`next`, `vite`, `angular`, …) | *(none)* |
| `--port <port>` | SSH port | `22` |
| `--key <path>` | SSH private key path | *(system default)* |
| `-u, --update` | Update an existing project instead of creating one | — |

Example:

```bash
remotry register my-app \
  --local ./ \
  --remote deploy@example.com:/var/www/my-app \
  --build-command "pnpm build" \
  --build-path ./dist \
  --key ~/.ssh/id_rsa

remotry deploy my-app
```

## Auto-detection

Package manager is inferred from the lockfile:

| Lockfile | Package manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `bun.lockb` | bun |
| `package-lock.json` | npm |
| *(none)* | pnpm (fallback) |

Project type is inferred from signature files:

| Signature | Type | Framework |
|---|---|---|
| `package.json` + `next` | node | next |
| `package.json` + `nuxt` | node | nuxt |
| `package.json` + `vite` | node | vite |
| `package.json` + `@angular/core` | node | angular |
| `package.json` + `@remix-run/react` | node | remix |
| `package.json` (generic) | node | — |
| `pyproject.toml` / `requirements.txt` | python | — |
| `Cargo.toml` | rust | — |
| `go.mod` | go | — |
| `Dockerfile` | docker | — |
| `composer.json` | php | — |

## Configuration

### Global registry

`~/.remotry/projects.json` holds every registered project. The CLI and the
VSCode extension share it.

### Per-workspace `.deployrc` (optional)

Drop a `.deployrc` JSON file in a project root. Both `remotry init` and the
VSCode register form prefill from it:

```json
{
  "name": "my-app",
  "buildCommand": "pnpm build",
  "buildPath": "./dist",
  "installCommand": "pnpm install",
  "remoteHost": "example.com",
  "remoteUser": "deploy",
  "remotePath": "/var/www/my-app",
  "sshKey": "~/.ssh/id_rsa"
}
```

Commit this file so teammates inherit the deploy config — typically only the
SSH key path needs a local override.

## Deploy flow

1. **Install** — runs `installCommand` (if set) in the local project path
2. **Build** — runs `buildCommand` in the local project path
3. **Upload** — recursively SFTP-copies `buildPath` into a new timestamped release
   directory: `remotePath/releases/<timestamp>/`
4. **Activate** — atomically repoints the `remotePath/current` symlink at the new release
5. **Prune** — removes releases beyond the five most recent
6. **Record** — writes the `lastDeploy` timestamp to the global registry

### Remote layout

Deploys are versioned. `remotePath` becomes a container, and the live version is
always `remotePath/current`:

```
remotePath/
├── releases/
│   ├── 2026-07-13T10-00-00-000Z/
│   └── 2026-07-13T12-30-00-000Z/   ← newest
└── current -> releases/2026-07-13T12-30-00-000Z/
```

> **Point your web server (or process manager) at `remotePath/current`.**
> Rolling back is then an atomic symlink swap — no re-upload, no downtime:
>
> ```bash
> remotry rollback my-app --list          # see releases (* = live)
> remotry rollback my-app                 # go to the previous release
> remotry rollback my-app --version <name>  # go to a specific release
> ```

## Programmatic use

`@develoverli/remotry-core` exposes the deployment logic as pure functions and async
generators, with no CLI or console dependency:

```ts
import { deployProject } from "@develoverli/remotry-core";

for await (const event of deployProject("my-app")) {
  if (event.type === "progress") {
    console.log(`${event.current}/${event.total} ${event.file}`);
  }
}
```

## Requirements

- **Node.js 18+**
- **SSH key authentication** (recommended; password auth is supported by the
  core client but not exposed through the CLI)
- **VSCode 1.80+** for the extension

### Optional native acceleration

`ssh2` ships an optional `cpu-features` native module for crypto acceleration.
pnpm skips native build scripts by default; enable it with:

```bash
pnpm approve-builds
```

Without it, `ssh2` falls back to pure JavaScript — slower but fully functional.

## Development

```bash
git clone https://github.com/develoverli/remotry.git
cd remotry
pnpm install
pnpm -r build                                      # build all packages
pnpm --filter @develoverli/remotry-cli build       # build only the CLI
pnpm --filter remotry compile                      # build the VSCode extension (esbuild bundle)
```

Run the CLI from source:

```bash
node packages/cli/dist/cli.js --version
node packages/cli/dist/cli.js list
```

### VSCode extension dev loop

```bash
cd packages/vscode
pnpm watch                       # esbuild --watch
# In VSCode: press F5 to launch the Extension Development Host
```

## Contributing

Contributions are welcome — bug reports, feature requests, docs, and pull
requests all help. Open an issue at
[github.com/develoverli/remotry/issues](https://github.com/develoverli/remotry/issues)
to discuss a change first, then see [CONTRIBUTING.md](CONTRIBUTING.md) for the
dev setup and workflow. All participants are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Release notes live in
[CHANGELOG.md](CHANGELOG.md).

## Security

Found a vulnerability? Please **do not** open a public issue — report it
privately as described in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
