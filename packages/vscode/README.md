# Remotry for VSCode

> **Build your project and ship it to a remote server over SSH/SFTP — without leaving the editor.**

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/develoverli.remotry?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Deploy projects to remote servers over SSH/SFTP, directly from VSCode. Part of
the [Remotry](https://github.com/develoverli/remotry) toolkit.

## What it does

Remotry turns "build locally, then copy the output to a server" into a one-click
action. It auto-detects your stack and package manager, builds the project,
SFTP-uploads the output into a timestamped release, and atomically flips a
`current` symlink — so rollbacks are instant and deploys have no downtime. No
`rsync`, no `scp`, no terminal juggling.

The extension imports [`@develoverli/remotry-core`](https://www.npmjs.com/package/@develoverli/remotry-core)
and deploys **in-process** — it does **not** shell out to the CLI, and needs no
separate `@develoverli/remotry-cli` install. It shares the same `~/.remotry/projects.json`
registry as the CLI, so a project registered in either shows up in both.

## Install

From the editor: `Ctrl+P` → paste and run

```
ext install develoverli.remotry
```

Or install from the
[VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry).

## Features

- **Sidebar panel** — an activity-bar icon opens a "Deploy Projects" tree view of every registered project
- **One-click deploy** — inline deploy button on each tree item
- **Command palette** — all deploy actions via `Ctrl+Shift+P` → "Deploy:"
- **Register form** — a WebView form to add or edit a project, prefilled from `.deployrc` or auto-detection
- **Auto-activation** — activates on workspaces that contain a `.deployrc` file

## Requirements

- Node.js 18+
- An SSH key configured for the remote host

## Quick start

1. Click the **Remotry icon** (server with an upload arrow) in the activity bar (left sidebar).
2. Use **Register a Project** in the empty state — or `Ctrl+Shift+P` → `Deploy: Register / Edit Project`.
3. Fill in name, local path, remote (`user@host:/path`), and SSH key.
4. Click the **deploy** action on the tree item to build and ship.

## Commands

| Command | Description |
|---------|-------------|
| `Deploy: List Projects` | List all registered projects |
| `Deploy: Register / Edit Project` | Add or edit a project |
| `Deploy: Deploy` | Build and upload to the remote |
| `Deploy: Status` | Show the last deploy timestamp |
| `Deploy: Remove Project` | Unregister a project |
| `Deploy: Refresh` | Refresh the tree view |
| `Deploy: Open Config File` | Open the config file in the editor |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `deploy.sshKey` | `~/.ssh/id_rsa` | Default SSH private key |
| `deploy.defaultRemoteUser` | `root` | Default SSH username |
| `deploy.defaultRemoteBase` | `/var/www` | Default remote base path |

## Troubleshooting

**Sidebar icon missing** — reload VSCode after install (`Ctrl+Shift+P` → `Developer: Reload Window`).

**Deploy fails to connect** — verify the SSH key path and that the key is authorized on the remote host.

## Development

```bash
pnpm install
pnpm compile         # typecheck + esbuild bundle
pnpm watch           # esbuild --watch
pnpm package         # build the .vsix
code --install-extension remotry-*.vsix
```

## Contributing

Contributions welcome — issues, feature requests, and PRs. See
[CONTRIBUTING.md](https://github.com/develoverli/remotry/blob/main/CONTRIBUTING.md)
and open an issue at
[github.com/develoverli/remotry/issues](https://github.com/develoverli/remotry/issues).

## License

MIT — see [LICENSE](LICENSE).
