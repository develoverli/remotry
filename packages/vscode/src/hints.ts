import * as vscode from "vscode";
import {
  ConnectionTarget,
  ErrorHint,
  HintAction,
  authMethodOf,
  hintForError,
  targetTypeOf,
} from "@develoverli/remotry-core";

const WINDOWS_DEVELOPER_SETTINGS = "ms-settings:developers";

export const HINT_ACTION_LABELS: Record<HintAction, string> = {
  openDeveloperSettings: "Open Windows Settings",
  testConnection: "Test Connection",
  editProject: "Edit Project",
  showLog: "Show Log",
  rollback: "Roll Back...",
};

export function hintFor(
  target: Pick<ConnectionTarget, "targetType" | "authMethod"> | undefined,
  message: string
): ErrorHint | undefined {
  return hintForError(message, {
    targetType: target ? targetTypeOf(target) : undefined,
    authMethod: target ? authMethodOf(target) : undefined,
  });
}

export async function runHintAction(action: HintAction, projectName: string): Promise<void> {
  switch (action) {
    case "openDeveloperSettings":
      await vscode.env.openExternal(vscode.Uri.parse(WINDOWS_DEVELOPER_SETTINGS));
      break;
    case "testConnection":
      await vscode.commands.executeCommand("deploy.testConnection", projectName);
      break;
    case "editProject":
      await vscode.commands.executeCommand("deploy.register", projectName);
      break;
    case "showLog":
      await vscode.commands.executeCommand("deploy.showLog");
      break;
    case "rollback":
      await vscode.commands.executeCommand("deploy.rollback", projectName);
      break;
  }
}

/**
 * Error notification that leads with the plain-language fix when the error is recognized.
 * `extraActions` are shown after the hint's own actions.
 */
export async function showErrorWithHint(
  headline: string,
  message: string,
  projectName: string,
  hint: ErrorHint | undefined,
  options: { skip?: HintAction[]; extraActions?: string[] } = {}
): Promise<string | undefined> {
  const actions = (hint?.actions ?? []).filter((a) => !options.skip?.includes(a));
  const labels = [...actions.map((a) => HINT_ACTION_LABELS[a]), ...(options.extraActions ?? [])];
  const text = hint ? `${headline} ${hint.title} ${hint.steps[0] ?? ""}`.trim() : `${headline} ${message}`;
  const choice = await vscode.window.showErrorMessage(text, ...labels);
  const picked = actions.find((a) => HINT_ACTION_LABELS[a] === choice);
  if (picked) {
    await runHintAction(picked, projectName);
    return undefined;
  }
  return choice;
}
