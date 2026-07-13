# Contributing to Remotry

Thanks for considering a contribution. Remotry is a pnpm workspace with three packages:

- `packages/core` — pure deployment logic (no UI dependency)
- `packages/cli` — Commander-based CLI wrapper
- `packages/vscode` — VSCode extension (esbuild bundled)

## Setup

Requirements: **Node.js 18+**, **pnpm 8+**.

```bash
git clone https://github.com/coldevotion/remotry.git
cd remotry
pnpm install
pnpm -r build
```

## Where to make changes

| Change type | Location |
|-------------|----------|
| Deploy logic, SSH, detection, config | `packages/core/src/` |
| CLI commands, flags, output formatting | `packages/cli/src/` |
| VSCode commands, tree, WebView | `packages/vscode/src/` |
| Public API exports | `packages/core/src/index.ts` |

**Principle:** keep `core` pure — no `process.exit`, no `console.log`, no UI deps. The CLI and the extension consume `core` via its public API.

## Adding a new action

Example: add a `prune` action that removes old `.deploy-history/` entries on the remote.

1. **Core:** `packages/core/src/actions/prune.ts` — write a pure function (returns a value or an `AsyncGenerator<DeployEvent>`).
2. **Re-export:** add it to `packages/core/src/index.ts`.
3. **CLI:** `packages/cli/src/commands/prune.ts` — a Commander wrapper that calls the core action and formats output via `logger`.
4. **Register:** add `program.addCommand(pruneCommand)` in `packages/cli/src/cli.ts`.
5. **VSCode (optional):** wire a command in `packages/vscode/src/commands/deployCommands.ts` and a `contributes.commands` entry in `packages/vscode/package.json`.

## Build + test

```bash
pnpm -r build                                  # all packages
pnpm --filter remotry build               # CLI only
pnpm --filter remotry-vscode compile           # VSCode (typecheck + esbuild)
pnpm --filter remotry-vscode bundle:prod       # production bundle

node packages/cli/dist/cli.js --version        # 1.0.0
node packages/cli/dist/cli.js list             # smoke test
```

## VSCode extension dev loop

```bash
cd packages/vscode
pnpm watch                       # esbuild --watch
# In VSCode: F5 to launch the Extension Development Host
```

## Commit style

Conventional Commits preferred. Examples:

```
feat(core): add prune action for remote history cleanup
fix(vscode): re-render webview on workspace change
chore: bump versions to 1.1.0
docs(readme): clarify pnpm setup step
```

## Code style

- **TypeScript strict** — no `any`.
- **No `process.exit` in `core`** — throw errors and let consumers handle them.
- **No hardcoded paths/strings** — use constants or config.
- **No new deps without discussion** — open an issue first.

## Releasing (maintainers)

1. Bump versions in `packages/{core,cli,vscode}/package.json` (keep CLI + core in sync; the extension versions independently).
2. Update `CHANGELOG.md` (if present).
3. `pnpm -r build && pnpm --filter remotry-vscode bundle:prod && pnpm --filter remotry-vscode package`.
4. Publish the npm packages: `pnpm --filter remotry-core publish && pnpm --filter remotry publish`.
5. (VSCode Marketplace) `cd packages/vscode && pnpm publish` — requires a `vsce` PAT.

## Issues + PRs

- Bug reports: include OS, Node version, pnpm version, and the CLI/extension version.
- Feature requests: explain the use case before proposing an API.
- PRs: keep them focused. One concern per PR.

## License

By contributing, you agree your code is released under the [MIT License](LICENSE).
