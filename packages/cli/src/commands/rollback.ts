import { Command } from "commander";
import { rollbackProject } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";
import { resolveCredentials } from "../utils/credentials";
import { printHint } from "../utils/hints";

export const rollbackCommand = new Command("rollback")
  .description("Roll back a project to a previous release")
  .argument("<name>", "Project name")
  .option("--list", "List available releases")
  .option("--version <name>", "Roll back to a specific release name")
  .action(async (name: string, options: { list?: boolean; version?: string }) => {
    try {
      const credentials = await resolveCredentials(name);
      const result = await rollbackProject(name, { ...options, credentials });
      if (!result.available) {
        logger.error(result.output);
        return;
      }
      logger.info(result.output);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error(message);
      printHint(message, name);
      process.exit(1);
    }
  });
