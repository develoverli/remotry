import inquirer from "inquirer";
import {
  CredentialKind,
  Credentials,
  credentialEnvVarNames,
  credentialsFromEnv,
  requiredCredential,
  store,
} from "@develoverli/remotry-core";

const PROMPT_LABELS: Record<CredentialKind, (name: string) => string> = {
  password: (name) => `SSH password for "${name}":`,
  passphrase: (name) => `Passphrase for the SSH key of "${name}":`,
};

async function promptCredential(name: string, kind: CredentialKind): Promise<string> {
  if (!process.stdin.isTTY) {
    const vars = credentialEnvVarNames(name, kind).join(" or ");
    throw new Error(`Project "${name}" needs an SSH ${kind}. Set ${vars} to run non-interactively.`);
  }
  const { value } = await inquirer.prompt<{ value: string }>([
    {
      type: "password",
      name: "value",
      mask: "*",
      message: PROMPT_LABELS[kind](name),
      validate: (v: string) => v.length > 0 || "Required",
    },
  ]);
  return value;
}

/** Secrets for a project: environment variables first, then a hidden prompt. Never written to disk. */
export async function resolveCredentials(name: string): Promise<Credentials> {
  const credentials = credentialsFromEnv(name);
  const project = store.getProject(name);
  if (!project) return credentials;
  const needed = requiredCredential(project, credentials);
  if (needed) {
    credentials[needed] = await promptCredential(name, needed);
  }
  return credentials;
}
