# Security Policy

Remotry handles SSH credentials and pushes files to remote servers, so we take
security reports seriously.

## Supported versions

Only the latest release line receives security fixes.

| Package | Supported |
|---------|-----------|
| `@develoverli/remotry-core` latest `1.x` | ✅ |
| `@develoverli/remotry-cli` latest `1.x` | ✅ |
| `remotry` (VSCode extension) latest `1.x` | ✅ |
| Older versions | ❌ |

## How Remotry handles credentials

- **Passwords and SSH key passphrases are never written to disk by Remotry.** They are not
  stored in `~/.remotry/projects.json` or in `.deployrc`.
- **VSCode extension:** secrets are kept in VSCode secret storage (backed by the operating
  system keychain), only after you choose *Remember*. A secret the server rejects is deleted,
  and removing a project deletes its secrets.
- **CLI:** secrets are read from a hidden prompt or from environment variables
  (`REMOTRY_PASSWORD_<PROJECT>`, `REMOTRY_PASSWORD`, `REMOTRY_PASSPHRASE_<PROJECT>`,
  `REMOTRY_PASSPHRASE`). In CI, pass them as masked secrets.
- **SSH private keys** are read from the path you configure and are never copied or uploaded.
- **Folder targets** use your operating system account's permissions; no credentials are involved.
- Releases are kept outside the folder your app serves, and Remotry refuses layouts that would
  expose them.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Report them privately through GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/develoverli/remotry/security) of the repository.
2. Click **Report a vulnerability**
   ([direct link](https://github.com/develoverli/remotry/security/advisories/new)).
3. Fill in the advisory form.

Please include as much of the following as you can:

- The affected package(s) and version(s)
- The type of issue (e.g. command injection, path traversal, credential leak)
- Step-by-step instructions to reproduce, or a proof of concept
- The potential impact and how an attacker could exploit it

## What to expect

- We aim to acknowledge your report within **5 business days**.
- We will keep you informed while we investigate and work on a fix.
- Once a fix is released, we will publish a GitHub Security Advisory and credit
  you for the discovery, unless you prefer to remain anonymous.

Please give us a reasonable amount of time to release a fix before any public
disclosure.
