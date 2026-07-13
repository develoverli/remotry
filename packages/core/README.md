# remotry-core

> **Pure deployment logic for Remotry — SSH/SFTP project deploys with no CLI or UI dependency.**

[![npm](https://img.shields.io/npm/v/remotry-core.svg)](https://www.npmjs.com/package/remotry-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The engine behind [Remotry](https://github.com/coldevotion/remotry). It builds a
project locally and ships the output to a remote server over SSH/SFTP (via
`ssh2` — pure JavaScript, no external binary), versioning each deploy behind an
atomic `current` symlink. Framework-agnostic: no CLI, no console output, no
process spawning of its own — just typed functions and async generators you can
drive from a CLI, an editor extension, or a CI script.

Used by [`remotry-cli`](https://www.npmjs.com/package/remotry-cli) and the
Remotry VSCode extension. Install it directly when you want to embed deploys in
your own tooling.

## Install

```bash
npm install remotry-core
# or: pnpm add remotry-core
```

Requires **Node.js 18+**.

## Usage

`deployProject` is an async generator that yields typed progress events:

```ts
import { deployProject } from "remotry-core";

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
} from "remotry-core";
```

Lower-level building blocks are also exported:

| Export | Purpose |
|--------|---------|
| `SSHClient`, `parseSSHUrl`, `resolveHome` | SSH/SFTP client and URL helpers |
| `detectProjectType`, `detectPackageManager`, `pmCommands` | Stack + package-manager auto-detection |
| `store`, `Store` | Global project registry access |
| `loadGlobalConfig`, `saveGlobalConfig`, `loadProjectDeployrc`, `saveProjectDeployrc` | Config I/O (`~/.remotry/projects.json`, `.deployrc`) |
| `parseRemote`, `parseSSHUrl` | Parse `user@host:/path` remotes |

All functions ship TypeScript types (`DeployOptions`, `RegisterInput`,
`ProjectStatus`, `RollbackOptions`, `GlobalConfig`, `ProjectDeployrc`, …).

## Remote layout

Deploys are versioned. `remotePath` becomes a container; the live version is
always `remotePath/current`:

```
remotePath/
├── releases/
│   ├── 2026-07-13T10-00-00-000Z/
│   └── 2026-07-13T12-30-00-000Z/   ← newest
└── current -> releases/2026-07-13T12-30-00-000Z/
```

Rollback is an atomic symlink swap — no re-upload, no downtime.

See the [full documentation](https://github.com/coldevotion/remotry#readme) for
the deploy flow, auto-detection rules, and configuration.

## License

MIT — see [LICENSE](LICENSE).
