import { CredentialKind } from "./types";

/** Thrown before any work starts when a deploy needs a secret the caller did not supply. */
export class CredentialsRequiredError extends Error {
  constructor(
    public readonly projectName: string,
    public readonly kind: CredentialKind
  ) {
    super(
      kind === "password"
        ? `Project "${projectName}" needs an SSH password.`
        : `The SSH key for project "${projectName}" is protected by a passphrase.`
    );
    this.name = "CredentialsRequiredError";
  }
}

/** The server (or the key file) rejected the supplied credentials. Callers should forget stored secrets. */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly kind: CredentialKind | "key" | "agent"
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}
