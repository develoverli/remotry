# @develoverli/remotry-core

> **Pure deployment logic for Remotry — SSH/SFTP project deploys with no CLI or UI dependency.**

[![npm](https://img.shields.io/npm/v/@develoverli/remotry-core.svg)](https://www.npmjs.com/package/@develoverli/remotry-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The engine behind [Remotry](https://github.com/develoverli/remotry). It builds a
project locally and ships the output to a remote server over SSH/SFTP (via
`ssh2` — pure JavaScript, no external binary) or to a local/network folder, keeping
every deploy as a release you can roll back to. Framework-agnostic: no CLI, no console output, no
process spawning of its own — just typed functions and async generators you can
drive from a CLI, an editor extension, or a CI script.

Used by [`@develoverli/remotry-cli`](https://www.npmjs.com/package/@develoverli/remotry-cli) and the
[Remotry VSCode extension](https://marketplace.visualstudio.com/items?itemName=develoverli.remotry).
Install it directly when you want to embed deploys in your own tooling.

## Install

```bash
npm install @develoverli/remotry-core
# or: pnpm add @develoverli/remotry-core
```

> **Formerly published as `remotry-core`.** That unscoped package is no longer
> maintained (last version `1.0.2`) — replace it with `@develoverli/remotry-core`
> and update your imports.

Requires **Node.js 18+**.

## Usage

`deployProject` is an async generator that yields typed progress events:

```ts
import { deployProject } from "@develoverli/remotry-core";

for await (const event of deployProject("my-app")) {
  switch (event.type) {
    case "progress":
      console.log(`${event.current}/${event.total} ${event.file}`);
      break;
    case "done":
      console.log("deployed");
      break;
  }
}
```

Password logins and passphrase-protected keys take the secret at call time; it is never
persisted. Check what is missing first so you can prompt before a long build:

```ts
import {
  credentialsFromEnv,
  requiredCredential,
  deployProject,
  store,
} from "@develoverli/remotry-core";

const project = store.getProject("my-app")!;
const credentials = credentialsFromEnv("my-app"); // REMOTRY_PASSWORD_MY_APP, REMOTRY_PASSWORD, ...
const missing = requiredCredential(project, credentials); // "password" | "passphrase" | null
if (missing) credentials[missing] = await askUser(missing);

for await (const event of deployProject("my-app", { credentials })) {
  // ...
}
```

`deployProject` throws `CredentialsRequiredError` (before building) when a secret is
missing, and `AuthenticationError` when the server rejects it.

## API

Register, deploy, and manage projects programmatically:

```ts
import {
  registerProject,
  deployProject,
  deployAll,
  listProjects,
  getProjectStatus,
  updateProject,
  removeProject,
  rollbackProject,
  getProjectReleases,
  testConnection,
} from "@develoverli/remotry-core";
```

Lower-level building blocks are also exported:

| Export | Purpose |
|--------|---------|
| `testConnection`, `verifyCredentials` | Check a target is reachable and writable, or that credentials work, without deploying |
| `requiredCredential`, `credentialsFromEnv`, `credentialEnvVarNames`, `resolveAgentSocket` | Credential helpers |
| `CredentialsRequiredError`, `AuthenticationError` | Typed errors for missing or rejected secrets |
| `defaultBackupPath`, `validateFolderTarget`, `PRE_REMOTRY_RELEASE` | Folder target helpers |
| `describeTarget`, `targetTypeOf`, `authMethodOf` | Read a project's target and auth (with pre-1.1 defaults) |
| `usesNextStandalone`, `isNextBuildOutput` | Next.js standalone detection used by deploys |
| `hintForError` | Plain-language explanation, steps, and suggested actions for a known deploy or connection error |
| `SSHClient`, `parseSSHUrl`, `resolveHome` | SSH/SFTP client and URL helpers |
| `parseRemote` | Parse `user@host:/path` remotes |
| `detectProjectType`, `detectPackageManager`, `pmCommands`, `getProjectDisplayName` | Stack + package-manager auto-detection |
| `store`, `Store` | Global project registry access |
| `loadGlobalConfig`, `saveGlobalConfig`, `loadProjectDeployrc`, `saveProjectDeployrc`, `getGlobalConfigPath` | Config I/O (`~/.remotry/projects.json`, `.deployrc`) |
| `listProjectNames`, `relativeTime` | Registry and display helpers |

All functions ship TypeScript types (`DeployOptions`, `RegisterInput`,
`ProjectStatus`, `RollbackOptions`, `Credentials`, `TargetType`, `AuthMethod`,
`ProjectReleases`, `GlobalConfig`, `ProjectDeployrc`, …).

## Targets

| `targetType` | `authMethod` | Needs |
|---|---|---|
| `ssh` (default) | `key` (default) | `sshKey`; `credentials.passphrase` if the key is encrypted |
| `ssh` | `password` | `credentials.password` |
| `ssh` | `agent` | A running ssh-agent (`SSH_AUTH_SOCK`, or the OpenSSH pipe on Windows) |
| `folder` | — | `folderPath` (local or UNC); optional `backupPath` outside it |

SSH deploy options:

| Field | Values | Default |
|---|---|---|
| `activation` | `copy`: real files in `remotePath`, releases in `backupPath` (default `<remotePath>.remotry-releases`). `symlink`: `remotePath/releases/` plus a `current` symlink | `copy` for new projects, `symlink` for projects registered before 1.1.0 |
| `uploadMode` | `archive` (one `.tar.gz`, falls back to files if the server lacks `tar`) or `files` | `archive` |
| `postDeployCommand` | Any shell command, run in the live folder after deploy and rollback (locally for folder targets) | *(none)* |

## Layouts

`activation: "copy"` keeps your app pointing at the folder you chose:

```
my-app/                         ← live files
my-app.remotry-releases/
├── 2026-07-13T10-00-00-000Z/
├── 2026-07-13T12-30-00-000Z/   ← live
└── .current
```

`activation: "symlink"`:

```
remotePath/
├── releases/
│   ├── 2026-07-13T10-00-00-000Z/
│   └── 2026-07-13T12-30-00-000Z/   ← newest
└── current -> releases/2026-07-13T12-30-00-000Z/
```

Folder deploys use the same layout as `copy`, with `folderPath` and `backupPath`
(default `<folderPath>.remotry-releases`). Rollback never re-uploads anything.

See the [full documentation](https://github.com/develoverli/remotry#readme) for
the deploy flow, folder layout, auto-detection rules, and configuration.

## Contributing

Contributions welcome — issues, feature requests, and PRs. See
[CONTRIBUTING.md](https://github.com/develoverli/remotry/blob/main/CONTRIBUTING.md)
and open an issue at
[github.com/develoverli/remotry/issues](https://github.com/develoverli/remotry/issues).

## License

MIT — see [LICENSE](LICENSE).
