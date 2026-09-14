import chalk from "chalk";
import { authMethodOf, hintForError, store, targetTypeOf } from "@develoverli/remotry-core";

/** Print a plain-language fix below an error, when Remotry recognizes it. */
export function printHint(message: string, projectName?: string): void {
  const project = projectName ? store.getProject(projectName) : undefined;
  const hint = hintForError(message, {
    targetType: project ? targetTypeOf(project) : undefined,
    authMethod: project ? authMethodOf(project) : undefined,
  });
  if (!hint) return;
  console.log();
  console.log(chalk.yellow(`How to fix: ${hint.title}`));
  for (const step of hint.steps) {
    console.log(chalk.gray(`   • ${step}`));
  }
  if (hint.actions.includes("openDeveloperSettings")) {
    console.log(chalk.gray("   • Open the setting directly: start ms-settings:developers"));
  }
}
