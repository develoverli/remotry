import { Command } from "commander";
import { describeTarget, listProjects, relativeTime, ProjectConfig } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";
import chalk from "chalk";

export const listCommand = new Command("list")
  .description("List all registered projects")
  .option("--json", "Output as JSON")
  .action((options: { json?: boolean }) => {
    const projects = listProjects();
    const names = Object.keys(projects);

    if (names.length === 0) {
      logger.info("No projects registered yet.");
      logger.info("Run 'remotry init' or 'remotry register' to add a project.");
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(projects, null, 2));
      return;
    }

    logger.section("Registered Projects");
    console.log();

    const cols = [chalk.bold("Name"), chalk.bold("Type"), chalk.bold("Target"), chalk.bold("Last Deploy")];
    console.log(`  ${cols.join("  │  ")}`);
    console.log(chalk.gray("  " + "─".repeat(100)));

    for (const name of names.sort()) {
      const p: ProjectConfig = projects[name];
      const typeLabel = (p.framework ?? p.projectType ?? "unknown");
      const remoteLabel = describeTarget(p) || "?";
      const deployLabel = p.lastDeployStatus === "failed"
        ? chalk.red("failed")
        : p.lastDeploy ? relativeTime(p.lastDeploy) : chalk.gray("never");
      const row = [
        chalk.cyan(p.name.padEnd(18)),
        typeLabel.padEnd(14),
        remoteLabel.padEnd(35),
        deployLabel,
      ];
      console.log(`  ${row.join("  │  ")}`);
    }

    console.log();
    console.log(chalk.gray(`  Total: ${names.length} project(s)`));
  });
