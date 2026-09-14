import { Command } from "commander";
import { describeTarget, getProjectStatus } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";

export const updateCommand = new Command("update")
  .description("Show current project config (use register --update to modify)")
  .argument("<name>", "Project name")
  .action((name: string) => {
    try {
      const { project } = getProjectStatus(name);
      logger.info(`Project "${name}" current configuration:`);
      logger.info(`  Local path:    ${project.localPath}`);
      logger.info(`  Target:        ${describeTarget(project)}`);
      logger.info(`  Build command: ${project.buildCommand}`);
      logger.info(`  Build path:    ${project.buildPath}`);
      logger.info(`  Type:          ${project.projectType}${project.framework ? ` (${project.framework})` : ""}`);
      logger.info("");
      logger.info(`Use 'remotry register "${name}" --update [options]' to modify.`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
