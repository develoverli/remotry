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
- **Any SSH login**: key file (with optional passphrase), password, or ssh-agent
- **Folder targets**: deploy to a local disk or network share (`\\server\site`) with no SSH at all
- **Versioned releases + rollback** for both SSH and folder targets
- **Secrets never touch project files**: VSCode keeps them in your system keychain; the CLI prompts or reads env vars
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

No terminal needed:

- **A card per project** in the sidebar, with the project for the open workspace first
- **Big Deploy button** plus Roll back, Test connection, Edit, and a menu for Status, Reveal folder, and Remove
- **Live progress on the card**: current step, a file progress bar, and the last log lines
- **Failures you can act on**: the error stays on the card with Show log and Retry, plus "How to fix" steps for common problems (also printed by the CLI)
- **Status bar button** (`Deploy <project>`) for the project registered for the open workspace
- **Test connection** from the register form before saving
- **Roll back** by picking a release from a list

You can also build the `.vsix` from source (see [Development](#development)).

## CLI commands

| Command | Description |
|---------|-------------|
| `init [name]` | Interactive setup wizard |
| `register <name> [options]` | Register/update a project without prompts |
| `deploy <name>` | Build and upload (SFTP) or copy (folder) the build output |
| `deploy <name> --dry-run` | Show what would be deployed, without uploading |
| `deploy-all [--filter <pattern>] [--sequential]` | Deploy every registered project |
| `list [--json]` | List registered projects |
| `status <name>` | Show config and last-deploy time |
| `update <name>` | Print the current config (use `register --update` to change it) |
| `remove <name>` | Unregister a project |
| `rollback <name>` | Go back to the previous release |
| `rollback <name> --list` | List stored releases (`*` marks the live one) |
| `rollback <name> --version <name>` | Go back to a specific release |

### `register` options

| Flag | Description | Default |
|------|-------------|---------|
| `--local <path>` | Local project path | `.` |
| `--target-type <type>` | `ssh` or `folder` | `ssh` (or `folder` when only `--folder` is given) |
| `--remote <path>` | Remote destination as `user@host:/path` | — (required for `ssh`) |
| `--auth <method>` | SSH login: `key`, `password`, or `agent` | `key` |
| `--folder <path>` | Target folder, local or UNC share | — (required for `folder`) |
| `--backup-path <path>` | Releases folder for rollback (folder targets and `copy` activation) | `<target>.remotry-releases` |
| `--activation <mode>` | SSH: `copy` files into the remote path, or `symlink` a `current` folder | `copy` |
| `--upload-mode <mode>` | SSH: `archive` (one `.tar.gz`) or `files` (one by one) | `archive` |
| `--post-deploy <cmd>` | Command to run after a release goes live (and after rollback) | *(none)* |
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

## Authentication and targets

| Scenario | Register with | What happens at deploy |
|---|---|---|
| SSH key file | `--auth key --key ~/.ssh/id_ed25519` | Connects with the key. If the key has a passphrase, you are asked for it |
| SSH password | `--auth password` | You are asked for the password (hidden input) |
| Keys already loaded in an agent | `--auth agent` | Uses `SSH_AUTH_SOCK`, or the OpenSSH agent pipe on Windows. Nothing to type |
| Local or network folder, no SSH | `--folder '\\fileserver\sites\my-app'` | Copies the build using your OS account's file permissions |

**Passwords and passphrases are never written to `projects.json` or `.deployrc`.**

- **VSCode** stores them in the system keychain (via VSCode secret storage), only after you choose *Remember*. A wrong saved password is forgotten and you are asked again.
- **CLI** asks with a hidden prompt, or reads environment variables for CI:

  | Variable | Used for |
  |---|---|
  | `REMOTRY_PASSWORD_<PROJECT>` | Password for one project (`my-app` → `REMOTRY_PASSWORD_MY_APP`) |
  | `REMOTRY_PASSWORD` | Password fallback for any project |
  | `REMOTRY_PASSPHRASE_<PROJECT>` / `REMOTRY_PASSPHRASE` | SSH key passphrase |

  ```bash
  export REMOTRY_PASSWORD_MY_APP='s3cret' && remotry deploy my-app
  ```

Using Pageant on Windows? Set `SSH_AUTH_SOCK=pageant` before starting VSCode or the CLI.

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

### Next.js standalone

When `next.config` sets `output: "standalone"` and **Build output** is `.next` or
`.next/standalone`, Remotry deploys only what the server needs, assembled the way the
[Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
describe:

- `.next/standalone` (the server and its traced `node_modules`)
- `.next/static` copied to `.next/static` next to `server.js`
- `public` copied next to `server.js`

The build cache and intermediate files in `.next` are never uploaded. pnpm symlinks inside
standalone (which point back to your machine) are replaced by the traced files, and
monorepos are supported (`server.js` is found wherever Next.js placed it). Start the app on
the server with `node server.js` from the deployed folder, and use a post-deploy command
such as `pm2 restart my-app` to restart it after each deploy.

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
  "targetType": "ssh",
  "authMethod": "key",
  "remoteHost": "example.com",
  "remoteUser": "deploy",
  "remotePath": "/var/www/my-app",
  "sshKey": "~/.ssh/id_rsa"
}
```

Optional fields: `"activation"` (`"copy"` or `"symlink"`), `"uploadMode"` (`"archive"` or
`"files"`), `"backupPath"` (releases folder), and `"postDeployCommand"`.

For a folder target, use `"targetType": "folder"` with `"folderPath"` (and optionally
`"backupPath"`) instead of the `remote*` and `sshKey` fields. Never put passwords in this file.

Commit this file so teammates inherit the deploy config — typically only the
SSH key path needs a local override.

## Deploy flow

1. **Install** — runs `installCommand` (if set) in the local project path
2. **Build** — runs `buildCommand` in the local project path
3. **Upload** — SSH: sends `buildPath` as one `.tar.gz` archive (or file by file with
   `uploadMode: "files"`, or when the server has no `tar`) into a new timestamped release.
   Folder: copies it into `backupPath/<timestamp>/`
4. **Activate** — makes the release live (see the layouts below); if a folder copy fails,
   the previous release is restored
5. **Prune** — removes releases beyond the five most recent
6. **Post-deploy** — runs `postDeployCommand` (if set), e.g. `pm2 restart my-app`: on the
   server for SSH targets, on your machine for folder targets. It also runs after a rollback
7. **Record** — writes the deploy time and result (`success` / `failed`) to the global registry

Roll back without re-uploading anything:

```bash
remotry rollback my-app --list            # see releases (* = live)
remotry rollback my-app                   # go to the previous release
remotry rollback my-app --version <name>  # go to a specific release
```

### SSH layout: `activation: "copy"` (default)

Your app keeps running from the folder you chose. Remotry puts the real files there and
keeps every release next to it:

```
/var/www/
├── my-app/                        ← your app / web server points here (unchanged)
└── my-app.remotry-releases/
    ├── 0000-pre-remotry/          ← what was there before the first deploy
    ├── 2026-07-13T10-00-00-000Z/
    ├── 2026-07-13T12-30-00-000Z/  ← live
    └── .current
```

A release goes live by copying it next to `my-app/` on the server and swapping the two
folders with renames, so the app never sees a mix of old and new files. If the SSH user
cannot write to the parent folder, Remotry syncs the files in place instead.

### SSH layout: `activation: "symlink"`

`remotePath` becomes a container and the live version is always `remotePath/current`.
Switching releases is an atomic symlink swap. Projects registered before 1.1.0 use this layout.

```
remotePath/
├── releases/
│   ├── 2026-07-13T10-00-00-000Z/
│   └── 2026-07-13T12-30-00-000Z/   ← newest
└── current -> releases/2026-07-13T12-30-00-000Z/
```

> **With this layout, point your web server (or process manager) at `remotePath/current`.**

### Folder layout

Folder targets cannot rely on symlinks (network shares often reject them), so the
target folder always holds real files and every release is kept next to it:

```
\\fileserver\sites\
├── my-app\                         ← your web server points here
└── my-app.remotry-releases\
    ├── 0000-pre-remotry\           ← what was there before the first deploy
    ├── 2026-07-13T10-00-00-000Z\
    ├── 2026-07-13T12-30-00-000Z\   ← live
    └── .current
```

Rollback copies the chosen release back into the target folder. The releases folder
must be **outside** the target folder so the web server never exposes old releases;
Remotry refuses a layout that breaks this rule.

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
- **An SSH login** (key, password, or ssh-agent) for SSH targets, or **write access** to the folder for folder targets
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
