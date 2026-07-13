# Remotry for VSCode

Deploy projects to remote servers over SSH/SFTP, directly from VSCode. Part of
the [Remotry](https://github.com/coldevotion/remotry) toolkit.

The extension imports [`remotry-core`](https://github.com/coldevotion/remotry/tree/main/packages/core)
and deploys in-process — it does **not** shell out to the CLI.

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

1. Click the **rocket icon** in the activity bar (left sidebar).
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
code --install-extension remotry-vscode-*.vsix
```

## License

MIT
