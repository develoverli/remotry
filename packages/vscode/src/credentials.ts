import * as vscode from "vscode";
import {
  AuthenticationError,
  CredentialKind,
  Credentials,
  CredentialsRequiredError,
  ProjectConfig,
  requiredCredential,
  verifyCredentials,
} from "@develoverli/remotry-core";

const SECRET_PREFIX = "remotry";
const CREDENTIAL_KINDS: readonly CredentialKind[] = ["password", "passphrase"];
const MAX_ATTEMPTS = 3;

const PROMPTS: Record<CredentialKind, { title: (name: string) => string; prompt: string }> = {
  password: {
    title: (name) => `SSH password for "${name}"`,
    prompt: "Used to connect to the server.",
  },
  passphrase: {
    title: (name) => `SSH key passphrase for "${name}"`,
    prompt: "Your SSH key is protected by a passphrase.",
  },
};

/** Passwords and passphrases in VSCode's secret storage (the OS keychain). Never in project files. */
export class CredentialVault {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  private key(name: string, kind: CredentialKind): string {
    return `${SECRET_PREFIX}.${kind}.${name}`;
  }

  async get(name: string): Promise<Credentials> {
    const [password, passphrase] = await Promise.all(CREDENTIAL_KINDS.map((kind) => this.secrets.get(this.key(name, kind))));
    return { password, passphrase };
  }

  async has(name: string, kind: CredentialKind): Promise<boolean> {
    return !!(await this.secrets.get(this.key(name, kind)));
  }

  async store(name: string, kind: CredentialKind, value: string): Promise<void> {
    await this.secrets.store(this.key(name, kind), value);
  }

  async forget(name: string, kind?: CredentialKind): Promise<void> {
    const kinds = kind ? [kind] : CREDENTIAL_KINDS;
    await Promise.all(kinds.map((k) => this.secrets.delete(this.key(name, k))));
  }
}

function offerToRemember(vault: CredentialVault, name: string, kind: CredentialKind, value: string): void {
  void vscode.window
    .showInformationMessage(`Remember the SSH ${kind} for "${name}" on this computer?`, "Remember", "Not now")
    .then((choice) => (choice === "Remember" ? vault.store(name, kind, value) : undefined));
}

/**
 * Run `action` with the project's secrets. Missing ones are asked for (and checked against the
 * server before `action` starts); wrong saved ones are forgotten and asked for again.
 * Resolves to `undefined` if the user cancels.
 */
export async function withCredentials<T>(
  vault: CredentialVault,
  project: ProjectConfig,
  action: (credentials: Credentials) => Promise<T>
): Promise<T | undefined> {
  const credentials = await vault.get(project.name);
  const prompted = new Set<CredentialKind>();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const needed = requiredCredential(project, credentials);
    if (needed) {
      const value = await vscode.window.showInputBox({
        title: PROMPTS[needed].title(project.name),
        prompt: PROMPTS[needed].prompt,
        password: true,
        ignoreFocusOut: true,
      });
      if (!value) return undefined;
      credentials[needed] = value;
      prompted.add(needed);
    }

    try {
      if (prompted.size > 0) {
        // Catch a typo now instead of after a full build.
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Connecting to ${project.remoteHost}...` },
          () => verifyCredentials(project, credentials)
        );
      }
      const result = await action(credentials);
      for (const kind of prompted) {
        const value = credentials[kind];
        if (value) offerToRemember(vault, project.name, kind, value);
      }
      return result;
    } catch (err) {
      if (err instanceof CredentialsRequiredError) continue;
      if (err instanceof AuthenticationError && (err.kind === "password" || err.kind === "passphrase")) {
        const kind = err.kind;
        await vault.forget(project.name, kind);
        credentials[kind] = undefined;
        prompted.delete(kind);
        const retry = await vscode.window.showErrorMessage(err.message, "Try again");
        if (retry !== "Try again") return undefined;
        continue;
      }
      throw err;
    }
  }
  return undefined;
}
