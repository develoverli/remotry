import { Command } from "commander";
import { Credentials, deployAll, listProjectNames } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";
import { resolveCredentials } from "../utils/credentials";
import { printHint } from "../utils/hints";

export const deployAllCommand = new Command("deploy-all")
  .description("Deploy all registered projects")
  .option("--sequential", "Deploy one by one (default: parallel)")
  .option("--filter <pattern>", "Only deploy projects matching pattern")
  .action(async (options: { sequential?: boolean; filter?: string }) => {
    try {
      // Collect every secret up front: prompts cannot interleave with parallel deploys.
      const names = listProjectNames().filter((n) => !options.filter || n.includes(options.filter));
      const credentials = new Map<string, Credentials>();
      for (const name of names) {
        credentials.set(name, await resolveCredentials(name));
      }
      for await (const event of deployAll({ ...options, credentials: (name) => credentials.get(name) })) {
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
            else {
              logger.error(`${event.name}: failed${event.error ? ` — ${event.error}` : ""}`);
              if (event.error) printHint(event.error, event.name);
            }
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
