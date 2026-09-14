# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions apply to `@develoverli/remotry-core`, `@develoverli/remotry-cli`, and the
`remotry` VSCode extension unless noted.

## [Unreleased]

## [1.1.0] - 2026-09-14

### Added

- **SSH password login** (`authMethod: "password"`) and **ssh-agent login** (`authMethod: "agent"`,
  using `SSH_AUTH_SOCK` or the OpenSSH agent pipe on Windows).
- **Passphrase-protected SSH keys**: the passphrase is requested instead of failing.
- **Folder targets** (`targetType: "folder"`): deploy to a local disk or network share without SSH.
  Each release is kept in a releases folder outside the target (default `<folder>.remotry-releases`),
  with rollback, pruning, and automatic restore if a copy fails.
- **Secrets are never persisted to project files.** The CLI prompts with hidden input or reads
  `REMOTRY_PASSWORD_<PROJECT>`, `REMOTRY_PASSWORD`, `REMOTRY_PASSPHRASE_<PROJECT>`, and
  `REMOTRY_PASSPHRASE`. The VSCode extension stores them in the system keychain when you choose
  *Remember*, and forgets them when they are rejected or the project is removed.
- **CLI:** `register --target-type`, `--auth`, `--folder`, `--backup-path`; `init` asks for the target
  and login method; `status` and `list` show the target and failed deploys.
- **core:** `testConnection`, `verifyCredentials`, `requiredCredential`, `credentialsFromEnv`,
  `getProjectReleases`, `CredentialsRequiredError`, `AuthenticationError`, and the `Credentials`,
  `TargetType`, and `AuthMethod` types. Projects record `lastDeployStatus` and `lastDeployError`.
- **VSCode extension:**
  - New sidebar panel with a card per project (workspace project first, filter for long lists):
    status badge, target and login, a Deploy button, Roll back, Test connection, Edit, and a menu
    with Status, Reveal local folder, and Remove.
  - Live deploy progress on the card (step, file progress bar, last log lines) instead of popups
    while the panel is open; failures stay on the card with Show log and Retry.
  - Keyboard navigable menus and screen reader announcements for status changes.
  - "How to fix" guidance for common failures on the card, in error notifications, and in the
    register form's connection test, with buttons such as **Open Windows Settings**.
  - `Deploy: Show Deploy Log` command.
  - Status bar button to deploy (or register) the project for the open workspace.
  - Roll back from a release picker.
  - Register form: SSH or folder target, login method, password and passphrase fields,
    activation, upload mode, releases folder, post-deploy command, and **Test connection**.
    After registering, a **Deploy Now** action.
- **Copy activation for SSH** (`activation: "copy"`): the remote path you choose holds the real
  files, so your app and web server keep pointing at the same folder. Releases are kept in
  `<remote path>.remotry-releases` (configurable with `backupPath`) and go live by a
  rename swap, or an in-place sync when the parent folder is not writable. The first deploy
  keeps the previous contents as release `0000-pre-remotry`.
- **Compressed uploads** (`uploadMode: "archive"`, the default): SSH deploys send one `.tar.gz`
  and unpack it on the server, falling back to file-by-file when the server has no `tar`.
  Archive progress is reported in bytes.
- **Post-deploy command** (`postDeployCommand`, CLI `--post-deploy`): runs after a release goes
  live and after rollback, on the server for SSH targets and locally for folder targets. If it
  fails, the release stays live and the deploy is marked failed with a hint to roll back.
- **CLI:** `register --activation`, `--upload-mode`, `--post-deploy`; `init` asks where the app
  runs from and for a post-deploy command.
- **Error guidance** (`hintForError` in core, printed by the CLI): Windows symlink permissions
  (`EPERM ... symlink`, e.g. Next.js standalone builds), missing build tools, wrong build output,
  unknown host, refused or timed-out connections, rejected SSH key / password / ssh-agent,
  permission denied, archive extraction failures, missing Next.js standalone output, and failed
  post-deploy commands.
- **Next.js standalone builds**: with `output: "standalone"` and Build output `.next` or
  `.next/standalone`, deploys ship `.next/standalone` plus `.next/static` and `public` placed next
  to `server.js` (monorepos included), without the build cache. Links that point back into the
  local `node_modules` are replaced by the traced files, so the upload stays small. Auto-detection
  proposes `.next/standalone` for these projects.
- Failed install and build commands now report the end of the command output, so the actual
  error is visible even when the tool logs it to stdout.

### Changed

- **SSH:** new projects default to copy activation. Projects registered before 1.1.0 keep the
  `current` symlink layout until you change **App runs from** (or `--activation`).
- **core:** new dependency [`tar`](https://www.npmjs.com/package/tar) for compressed uploads.

- **VSCode extension:** the sidebar panel replaces the project tree view.
- **VSCode extension:** bundles the [Codicons](https://github.com/microsoft/vscode-codicons) icon font
  (CC BY 4.0) for the panel.
- **VSCode extension:** command titles no longer repeat the "Deploy:" prefix in menus
  (for example `Deploy: Deploy Project` in the Command Palette, `Deploy Project` in menus).
- **VSCode extension:** activates on startup so the status bar button is available in any workspace.

Projects registered with earlier versions keep working unchanged: they default to an SSH target
with key login.

## [1.0.4] - 2026-09-14

### Changed

- **VSCode extension:** project items in the Deploy Projects tree now use the
  Remotry icon (with light and dark theme variants) instead of the generic rocket.

### Fixed

- npm package READMEs now link to the correct Marketplace extension ID
  (`develoverli.remotry`).

## [1.0.3] - 2026-09-14

### Changed

- Repository moved to [`develoverli/remotry`](https://github.com/develoverli/remotry);
  `homepage`, `bugs`, `repository`, and `author` updated in every package.
- License copyright holder is now `develoverli`.
- **npm packages renamed:** `remotry-core` → `@develoverli/remotry-core` and
  `remotry-cli` → `@develoverli/remotry-cli`. The unscoped packages are no longer
  maintained (last version `1.0.2`); install the scoped ones instead. The CLI binary
  is still `remotry`.
- **VSCode extension:** new Marketplace icon and activity bar icon.
- **VSCode extension:** Marketplace publisher changed from `coldevotion` to
  `develoverli`, the extension `name` from `remotry-vscode` to `remotry`, and its
  display name from "Remotry" to "Remotry Deploy". The
  extension ID is now `develoverli.remotry`; users of `coldevotion.remotry-vscode`
  must install the new extension to keep receiving updates.

### Fixed

- `remotry --version` now reports the actual package version instead of a hardcoded `1.0.0`.

### Added

- `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, issue templates, and a pull request template.

## [1.0.2] - 2026-07-13

### Changed

- Version bump across all packages.

## [1.0.1] - 2026-07-13

### Added

- Per-package `README.md` and `LICENSE` files.
- VSCode Marketplace links and `CONTRIBUTING.md`.

## [1.0.0] - 2026-07-13

### Added

- Initial public release: `remotry-core`, `remotry-cli`, and the Remotry VSCode extension.
- SSH/SFTP deploys via `ssh2`, project and package-manager auto-detection,
  versioned releases with atomic `current` symlink, rollback, and multi-project deploy.

[Unreleased]: https://github.com/develoverli/remotry/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/develoverli/remotry/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/develoverli/remotry/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/develoverli/remotry/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/develoverli/remotry/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/develoverli/remotry/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/develoverli/remotry/releases/tag/v1.0.0
