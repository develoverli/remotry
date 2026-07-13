import { Command } from "commander";
import { deployAll } from "@remotry/core";
import { logger } from "../utils/logger";

export const deployAllCommand = new Command("deploy-all")
  .description("Deploy all registered projects")
  .option("--sequential", "Deploy one by one (default: parallel)")
  .option("--filter <pattern>", "Only deploy projects matching pattern")
  .action(async (options: { sequential?: boolean; filter?: string }) => {
    try {
      for await (const event of deployAll(options)) {
        switch (event.type) {
          case "start":
            logger.section(`Deploying ${event.names.length} project(s)`);
            break;
          case "project-start":
            logger.info(`--- ${event.name} ---`);
            break;
          case "project-event":
            if (event.event.type === "step") logger.step(`${event.event.current}/${event.event.total}`, event.event.message);
            else if (event.event.type === "error") logger.error(event.event.message);
            break;
          case "project-done":
            if (event.success) logger.success(`${event.name}: deployed`);
            else logger.error(`${event.name}: failed${event.error ? ` — ${event.error}` : ""}`);
            break;
          case "summary":
            console.log();
            logger.info(`Total: ${event.succeeded} succeeded, ${event.failed} failed`);
            break;
        }
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
