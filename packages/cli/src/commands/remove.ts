import { Command } from "commander";
import { removeProject } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";

export const removeCommand = new Command("remove")
  .description("Remove a registered project")
  .argument("<name>", "Project name to remove")
  .action((name: string) => {
    try {
      removeProject(name);
      logger.success(`Project "${name}" removed`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
