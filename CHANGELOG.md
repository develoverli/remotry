# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions apply to `@develoverli/remotry-core`, `@develoverli/remotry-cli`, and the
`remotry` VSCode extension unless noted.

## [Unreleased]

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

[Unreleased]: https://github.com/develoverli/remotry/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/develoverli/remotry/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/develoverli/remotry/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/develoverli/remotry/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/develoverli/remotry/releases/tag/v1.0.0
