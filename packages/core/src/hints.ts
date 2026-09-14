import { AuthMethod, TargetType } from "./types";

/** Follow-up a UI can offer next to a hint. The CLI prints the steps instead. */
export type HintAction = "openDeveloperSettings" | "testConnection" | "editProject" | "showLog" | "rollback";

export interface ErrorHint {
  /** Stable identifier, for tests and docs. */
  id: string;
  /** One-sentence explanation in plain language. */
  title: string;
  /** What to do, in order. */
  steps: string[];
  actions: HintAction[];
}

export interface HintContext {
  platform?: NodeJS.Platform;
  targetType?: TargetType;
  authMethod?: AuthMethod;
}

interface HintRule {
  test: (message: string, ctx: Required<Pick<HintContext, "platform">> & HintContext) => boolean;
  hint: (ctx: HintContext) => ErrorHint;
}

const has = (message: string, pattern: RegExp) => pattern.test(message);

// Order matters: the first matching rule wins, so specific causes come before generic ones.
const RULES: HintRule[] = [
  {
    test: (m) => has(m, /Post-deploy command failed/i),
    hint: (ctx) => ({
      id: "post-deploy-failed",
      title: "The new release is live, but the post-deploy command failed.",
      steps: [
        ctx.targetType === "folder"
          ? "Run the command in a terminal inside the target folder to see the full error."
          : "Run the command on the server, inside the deploy folder, to see the full error.",
        "If the app is down, roll back to the previous release.",
      ],
      actions: ["rollback", "editProject", "showLog"],
    }),
  },
  {
    test: (m) => has(m, /Could not extract the archive/i),
    hint: () => ({
      id: "archive-extract-failed",
      title: "The server could not unpack the uploaded archive.",
      steps: [
        "Check there is enough disk space on the server (df -h).",
        "Or set Upload to File by file for this project.",
      ],
      actions: ["editProject", "showLog"],
    }),
  },
  {
    test: (m, ctx) => ctx.platform === "win32" && has(m, /EPERM/i) && has(m, /symlink/i),
    hint: () => ({
      id: "windows-symlink",
      title: "Windows blocked creating symbolic links during the build.",
      steps: [
        "Turn on Developer Mode in Windows Settings > System > For developers.",
        "Restart VSCode or your terminal, then deploy again.",
        "Alternatively, add node-linker=hoisted to the project's .npmrc and reinstall dependencies.",
      ],
      actions: ["openDeveloperSettings", "showLog"],
    }),
  },
  {
    test: (m) => has(m, /is not recognized as an internal or external command|command not found|spawn \S+ ENOENT/i),
    hint: () => ({
      id: "command-not-found",
      title: "A tool used by the install or build command is not installed or not on PATH.",
      steps: [
        "Install the missing tool (for pnpm: npm install -g pnpm), then restart VSCode or your terminal.",
        "Or change the Install and Build commands to tools you have.",
      ],
      actions: ["editProject", "showLog"],
    }),
  },
  {
    test: (m) => has(m, /Next\.js standalone output (not found|has no server\.js)/i),
    hint: () => ({
      id: "next-standalone-missing",
      title: "The Next.js standalone server was not generated.",
      steps: [
        "Check that next.config sets output: \"standalone\" and that the build finished without errors.",
        "If the build failed on Windows with EPERM symlink errors, turn on Developer Mode first.",
      ],
      actions: ["showLog", "editProject"],
    }),
  },
  {
    test: (m) => has(m, /Build path does not exist after build/i),
    hint: () => ({
      id: "build-output-missing",
      title: "The build finished, but its output folder was not found.",
      steps: [
        "Set Build output to the folder your build writes to.",
        "Common values: Vite ./dist, Next.js static export ./out, Next.js standalone .next/standalone.",
      ],
      actions: ["editProject"],
    }),
  },
  {
    test: (m) => has(m, /ENOTFOUND|EAI_AGAIN|getaddrinfo/i),
    hint: () => ({
      id: "host-not-found",
      title: "The server name could not be found.",
      steps: [
        "Check the host for typos.",
        "For private hosts (Tailscale, VPN, office network), make sure you are connected to that network.",
      ],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m) => has(m, /ECONNREFUSED/i),
    hint: () => ({
      id: "connection-refused",
      title: "The server refused the connection.",
      steps: ["Check the SSH port (usually 22).", "Make sure the SSH service is running on the server."],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m) => has(m, /ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|Timed out while waiting for handshake/i),
    hint: () => ({
      id: "connection-timeout",
      title: "The server did not respond.",
      steps: [
        "Check that you are on the right network, VPN, or Tailscale.",
        "A firewall may be blocking the SSH port.",
      ],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m, ctx) => has(m, /No ssh-agent found/i) || (ctx.authMethod === "agent" && has(m, /authentication failed|authentication methods failed/i)),
    hint: () => ({
      id: "agent-no-keys",
      title: "ssh-agent is not running or has no key the server accepts.",
      steps: [
        "Run ssh-add -l to list loaded keys, and ssh-add <key> to load yours.",
        "On Windows, start the OpenSSH Authentication Agent service, or open Pageant and set SSH_AUTH_SOCK=pageant.",
      ],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m, ctx) => ctx.authMethod === "password" && has(m, /authentication failed|authentication methods failed/i),
    hint: () => ({
      id: "password-rejected",
      title: "The server rejected the user or password.",
      steps: [
        "Check the user name and password.",
        "Some servers disable password login (PasswordAuthentication no); use an SSH key instead.",
      ],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m) => has(m, /authentication failed|authentication methods failed/i),
    hint: () => ({
      id: "key-rejected",
      title: "The server rejected your SSH key.",
      steps: [
        "Add your public key to ~/.ssh/authorized_keys on the server (for example: ssh-copy-id user@host).",
        "Check that the project points to the matching private key.",
      ],
      actions: ["testConnection", "editProject"],
    }),
  },
  {
    test: (m) => has(m, /EACCES|EPERM|Permission denied|cannot write to|No write access/i),
    hint: (ctx) => ({
      id: "permission-denied",
      title: "Permission denied while writing to the target.",
      steps:
        ctx.targetType === "folder"
          ? ["Your account needs write access to both the target folder and the releases folder."]
          : ["The SSH user needs write access to the remote path, for example: sudo chown -R <user> <path>."],
      actions: ["testConnection", "editProject"],
    }),
  },
];

/** Plain-language explanation and next steps for a known deploy or connection error. */
export function hintForError(message: string, context: HintContext = {}): ErrorHint | undefined {
  const ctx = { ...context, platform: context.platform ?? process.platform };
  const rule = RULES.find((r) => r.test(message, ctx));
  return rule?.hint(ctx);
}
