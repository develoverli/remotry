# @develoverli/remotry-cli

> **Deploy any project to a remote server over SSH/SFTP — from your terminal.**

[![npm](https://img.shields.io/npm/v/@develoverli/remotry-cli.svg)](https://www.npmjs.com/package/@develoverli/remotry-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The `remotry` command builds your project locally and ships the build output to
a remote server over SSH/SFTP — no `rsync` or `scp` binary required. It
auto-detects your stack and package manager, remembers your projects, and
versions every deploy behind an atomic `current` symlink for zero-downtime
rollbacks.

Part of the [Remotry](https://github.com/develoverli/remotry) workspace. For the
programmatic API see [`@develoverli/remotry-core`](https://www.npmjs.com/package/@develoverli/remotry-core);
for an in-editor experience, install the
[**Remotry** VSCode extension](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry-vscode)
— it shares the same project registry as this CLI.

## Install

```bash
npm install -g @develoverli/remotry-cli
# or: pnpm add -g @develoverli/remotry-cli

remotry --version
remotry init                     # interactive setup wizard
remotry deploy <name>            # build + ship
```

> **Formerly published as `remotry-cli`.** That unscoped package is no longer
> maintained (last version `1.0.2`) — run `npm uninstall -g remotry-cli` and
> install this one. The `remotry` command is unchanged.

Requires **Node.js 18+**.

## Commands

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

## Example

```bash
remotry register my-app \
  --local ./ \
  --remote deploy@example.com:/var/www/my-app \
  --build-command "pnpm build" \
  --build-path ./dist \
  --key ~/.ssh/id_rsa

remotry deploy my-app
```

## Deploy flow

1. **Install** — runs `installCommand` (if set) in the local project path
2. **Build** — runs `buildCommand` in the local project path
3. **Upload** — recursively SFTP-copies `buildPath` into a new timestamped
   release: `remotePath/releases/<timestamp>/`
4. **Activate** — atomically repoints the `remotePath/current` symlink at the new release
5. **Prune** — removes releases beyond the five most recent
6. **Record** — writes the `lastDeploy` timestamp to the global registry

Point your web server (or process manager) at `remotePath/current`. Rolling back
is then an atomic symlink swap — no re-upload, no downtime.

## Configuration

Projects live in a shared global registry at `~/.remotry/projects.json` (used by
both the CLI and the VSCode extension). You can also commit a per-workspace
`.deployrc` so teammates inherit the deploy config.

See the [full documentation](https://github.com/develoverli/remotry#readme) for
auto-detection rules, `.deployrc` format, and the remote layout.

## Contributing

Contributions welcome — issues, feature requests, and PRs. See
[CONTRIBUTING.md](https://github.com/develoverli/remotry/blob/main/CONTRIBUTING.md)
and open an issue at
[github.com/develoverli/remotry/issues](https://github.com/develoverli/remotry/issues).

## License

MIT — see [LICENSE](LICENSE).
