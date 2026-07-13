import { Command } from "commander";
import { deployProject } from "remotry-core";
import { logger } from "../utils/logger";

export const deployCommand = new Command("deploy")
  .description("Build and deploy a project to remote server")
  .argument("<name>", "Project name to deploy")
  .option("--dry-run", "Show what would be deployed without deploying")
  .action(async (name: string, options: { dryRun?: boolean }) => {
    try {
      logger.section(`Deploying "${name}"`);
      for await (const event of deployProject(name, { dryRun: options.dryRun })) {
        switch (event.type) {
          case "step":
            logger.step(`${event.current}/${event.total}`, event.message);
            break;
          case "info":
            logger.info(event.message);
            break;
          case "warn":
            logger.warn(event.message);
            break;
          case "success":
            logger.success(event.message);
            break;
          case "progress":
            // Spinner-like update on same line
            process.stdout.write(`\r  ${event.current}/${event.total} ${event.file.padEnd(60).slice(0, 60)}`);
            if (event.current === event.total) process.stdout.write("\n");
            break;
          case "error":
            logger.error(event.message);
            break;
          case "done":
            logger.section("Deployment Complete");
            logger.info(`Total time: ${(event.durationMs / 1000).toFixed(1)}s`);
            if (event.filesUploaded) logger.info(`Files uploaded: ${event.filesUploaded}`);
            break;
        }
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : "Unknown error");
      process.exit(1);
    }
  });
