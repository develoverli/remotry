# Security Policy

Remotry handles SSH credentials and pushes files to remote servers, so we take
security reports seriously.

## Supported versions

Only the latest release line receives security fixes.

| Package | Supported |
|---------|-----------|
| `remotry-core` latest `1.x` | ✅ |
| `remotry-cli` latest `1.x` | ✅ |
| `remotry-vscode` latest `1.x` | ✅ |
| Older versions | ❌ |

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
