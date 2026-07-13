import { Command } from "commander";
import { rollbackProject } from "@remotry/core";
import { logger } from "../utils/logger";

export const rollbackCommand = new Command("rollback")
  .description("Roll back a project to a previous release")
  .argument("<name>", "Project name")
  .option("--list", "List available releases")
  .option("--version <name>", "Roll back to a specific release name")
  .action(async (name: string, options: { list?: boolean; version?: string }) => {
    try {
      const result = await rollbackProject(name, options);
      if (!result.available) {
        logger.error(result.output);
        return;
      }
      logger.info(result.output);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
