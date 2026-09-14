# Remotry for VSCode

> **Build your project and ship it to a server or network folder, without leaving the editor.**

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/develoverli.remotry?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Deploy projects to remote servers over SSH/SFTP, or to a local or network folder,
directly from VSCode. Part of the [Remotry](https://github.com/develoverli/remotry) toolkit.

## What it does

Remotry turns "build locally, then copy the output to a server" into a one-click
action. It auto-detects your stack and package manager, builds the project, ships
the output as a timestamped release, and switches the live site to it, so rolling
back is one click too. No `rsync`, no `scp`, no terminal.

The extension imports [`@develoverli/remotry-core`](https://www.npmjs.com/package/@develoverli/remotry-core)
and deploys **in-process**: it does **not** shell out to the CLI, and needs no
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

- **Sidebar panel**: a card for every registered project, with the one for the open workspace first and a filter when you have many
- **One-click deploy**: a Deploy button on each card, plus Roll back, Test connection, Edit, and a menu with Status, Reveal local folder, and Remove
- **Live progress**: the card shows the current step, a file progress bar, and the last lines of output, with no popups while the panel is open
- **Clear failures**: the error stays on the card with **Show log** and **Retry**
- **How to fix**: common problems (Windows symlink permissions, missing build tools, wrong build output, unreachable host, rejected login, no write access) come with plain-language steps and a button to the right place, such as Windows Developer Mode settings
- **Keyboard and screen reader friendly**: labeled buttons, arrow-key menus, and status changes announced
- **Status bar button**: `Deploy <project>` for the project registered for the open workspace (or `Register for deploy` if there is none)
- **Register form** with **Test connection**, prefilled from `.deployrc` or auto-detection
- **Roll back** by picking a release from a list, with confirmation
- **Any login**: SSH key (with passphrase), password, or ssh-agent
- **Folder targets**: deploy to `D:\www\site` or `\\fileserver\sites\site` without SSH
- **Next.js standalone aware**: ships only `.next/standalone` with `.next/static` and `public` in place, never the build cache

## Connecting to your server

| Your setup | Choose | You will be asked for |
|---|---|---|
| SSH key file | **Sign in with: SSH key file** | Nothing, or the key passphrase if it has one |
| Username and password | **Sign in with: Password** | The password, on first deploy |
| Company machine where `ssh` "just works" | **Sign in with: ssh-agent** | Nothing. Uses keys already loaded in Pageant, the OpenSSH agent, or 1Password |
| Shared folder on the office network, no SSH | **Deploy to: Folder** | Nothing. Uses your Windows account's access to the share |

**Passwords and passphrases are stored only in your system keychain** (VSCode secret
storage), and only after you choose **Remember**. They are never written to
`projects.json` or `.deployrc`. If a saved password stops working, Remotry forgets it
and asks again. Removing a project also removes its saved secrets.

## Where your files end up

By default, the **remote path or folder you choose holds the real files**, so your app,
nginx, pm2, or IIS keep pointing at the same place. Each release is also kept in a
**Releases folder** (default: `<target>.remotry-releases`) so you can roll back without
uploading again. Keep it outside the folder your app serves; Remotry refuses a layout that
would expose old releases.

For SSH servers you can instead choose **App runs from: Remote path/current (symlink)**,
where switching releases is instant but your app must point at `<remote path>/current`.

Other SSH options in the register form:

- **Upload: One compressed archive** (default) sends a single `.tar.gz` and unpacks it on
  the server, much faster than thousands of small files. If the server has no `tar`, it
  falls back to file by file.
- **After deploy**: a command such as `pm2 restart my-app`, run on the server inside the
  app folder after every deploy and rollback (for folder targets it runs on your computer).

## Requirements

- VSCode 1.80+
- For SSH targets: an SSH login (key, password, or ssh-agent)
- For folder targets: write access to the target folder

## Quick start

1. Click the **Remotry icon** (server with an upload arrow) in the activity bar (left sidebar).
2. Click **Register a project** in the panel, or `Ctrl+Shift+P` → `Deploy: Register / Edit Project`.
3. Fill in name and local path, choose **SSH server** or **Folder**, and how to sign in.
4. Click **Test connection**, then **Register**.
5. Click **Deploy Now** in the notification, **Deploy** on the project card, or `Deploy <project>` in the status bar.

## Commands

| Command | Description |
|---------|-------------|
| `Deploy: Deploy Project` | Build and deploy |
| `Deploy: Roll Back...` | Pick an earlier release and make it live |
| `Deploy: Test Connection` | Check the target is reachable and writable |
| `Deploy: Register / Edit Project` | Add or edit a project |
| `Deploy: Show Status` | Show target, auth, and last deploy result |
| `Deploy: List Projects` | List all registered projects |
| `Deploy: Remove Project` | Unregister a project and forget its saved secrets |
| `Deploy: Refresh` | Refresh the projects panel |
| `Deploy: Show Deploy Log` | Open the full deploy output |
| `Deploy: Open Config File` | Open the config file in the editor |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `deploy.sshKey` | `~/.ssh/id_rsa` | Default SSH private key |
| `deploy.defaultRemoteUser` | `root` | Default SSH username |
| `deploy.defaultRemoteBase` | `/var/www` | Default remote base path |

## Troubleshooting

**Sidebar icon missing**: reload VSCode after install (`Ctrl+Shift+P` → `Developer: Reload Window`).

**Deploy fails to connect**: click **Test connection** (plug icon) on the project's card. For key login, check the key path and that the key is authorized on the server.

**ssh-agent finds no keys**: make sure the agent is running with your key loaded (`ssh-add -l`). For Pageant, set the environment variable `SSH_AUTH_SOCK=pageant` before starting VSCode.

**Folder deploy fails with "access denied"**: your Windows account needs write access to both the target folder and the releases folder.

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

### Third-party notices

The sidebar panel bundles the icon font from [Codicons](https://github.com/microsoft/vscode-codicons)
© Microsoft Corporation, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
(icons) and MIT (code).
