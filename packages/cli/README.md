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
[**Remotry Deploy** VSCode extension](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry)
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

Password login, or a network folder instead of SSH:

```bash
remotry register intranet --remote deploy@192.168.1.20:/var/www/intranet --auth password
remotry register docs --folder '\\fileserver\sites\docs'
```

When a deploy fails for a common reason (Windows symlink permissions, a missing build tool,
the wrong build output folder, an unreachable host, a rejected login, or no write access),
`remotry` prints **How to fix** steps below the error.

## Passwords and passphrases

They are never saved to disk. `remotry deploy` and `remotry rollback` ask for them with a
hidden prompt, or read them from environment variables so CI can run unattended:

| Variable | Used for |
|---|---|
| `REMOTRY_PASSWORD_<PROJECT>` | Password for one project (`my-app` → `REMOTRY_PASSWORD_MY_APP`) |
| `REMOTRY_PASSWORD` | Password fallback for any project |
| `REMOTRY_PASSPHRASE_<PROJECT>` / `REMOTRY_PASSPHRASE` | SSH key passphrase |

`--auth agent` uses keys already loaded in ssh-agent (`SSH_AUTH_SOCK`, or the OpenSSH
agent pipe on Windows), so nothing is asked.

Next.js apps with `output: "standalone"` (Build output `.next` or `.next/standalone`) deploy
only `.next/standalone` plus `.next/static` and `public`, arranged so `node server.js` works.

## Deploy flow

1. **Install** — runs `installCommand` (if set) in the local project path
2. **Build** — runs `buildCommand` in the local project path
3. **Upload** — SSH: one `.tar.gz` archive (or file by file) into a new timestamped release.
   Folder: copies it into `backupPath/<timestamp>/`
4. **Activate** — SSH with `--activation copy` (default) and folders: the release's files
   replace the contents of the path you chose, so your app keeps pointing at the same place.
   SSH with `--activation symlink`: repoints `remotePath/current`
5. **Prune** — removes releases beyond the five most recent
6. **Post-deploy** — runs `--post-deploy` (e.g. `pm2 restart my-app`), also after a rollback
7. **Record** — writes the deploy time and result to the global registry

Releases live in `<path>.remotry-releases` (change it with `--backup-path`), so rollback
never re-uploads anything.

> **Git Bash on Windows** rewrites arguments that start with `/` into Windows paths
> (`/srv/app` becomes `C:/Program Files/Git/srv/app`). When passing a server path to
> `--backup-path`, prefix the command with `MSYS_NO_PATHCONV=1`.

## Configuration

Projects live in a shared global registry at `~/.remotry/projects.json` (used by
both the CLI and the VSCode extension). You can also commit a per-workspace
`.deployrc` so teammates inherit the deploy config.

See the [full documentation](https://github.com/develoverli/remotry#readme) for
auto-detection rules, `.deployrc` format, and the SSH and folder layouts.

## Contributing

Contributions welcome — issues, feature requests, and PRs. See
[CONTRIBUTING.md](https://github.com/develoverli/remotry/blob/main/CONTRIBUTING.md)
and open an issue at
[github.com/develoverli/remotry/issues](https://github.com/develoverli/remotry/issues).

## License

MIT — see [LICENSE](LICENSE).
