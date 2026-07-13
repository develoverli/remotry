#!/usr/bin/env node

import { Command } from "commander";
import { registerCommand } from "./commands/register";
import { deployCommand } from "./commands/deploy";
import { listCommand } from "./commands/list";
import { removeCommand } from "./commands/remove";
import { updateCommand } from "./commands/update";
import { statusCommand } from "./commands/status";
import { initCommand } from "./commands/init";
import { deployAllCommand } from "./commands/deploy-all";
import { rollbackCommand } from "./commands/rollback";
import { logger } from "./utils/logger";

const program = new Command();

program
  .name("remotry")
  .description("Deploy any project to a remote server over SSH/SFTP")
  .version("1.0.0");

program.addCommand(initCommand);
program.addCommand(registerCommand);
program.addCommand(deployCommand);
program.addCommand(deployAllCommand);
program.addCommand(listCommand);
program.addCommand(removeCommand);
program.addCommand(updateCommand);
program.addCommand(statusCommand);
program.addCommand(rollbackCommand);

program.on("command:*", () => {
  logger.error("Invalid command. Use --help to see available commands.");
  process.exit(1);
});

try {
  program.parse(process.argv);
} catch (error) {
  logger.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exit(1);
}