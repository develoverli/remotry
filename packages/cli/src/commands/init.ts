import { Command } from "commander";
import inquirer from "inquirer";
import path from "path";
import fs from "fs-extra";
import os from "os";
import {
  registerProject,
  detectProjectType,
  getProjectDisplayName,
  loadProjectDeployrc,
} from "remotry-core";
import { logger } from "../utils/logger";

export const initCommand = new Command("init")
  .description("Interactive wizard to register a project for deployment")
  .argument("[name]", "Project name (defaults to folder name)")
  .option("--local <path>", "Local project path")
  .action(async (nameArg: string | undefined, options: { local?: string }) => {
    try {
      logger.section("remotry init");

      const defaultName = nameArg || path.basename(path.resolve(options.local || "."));
      const { name } = await inquirer.prompt<{ name: string }>([
        { type: "input", name: "name", message: "Project name:", default: defaultName, validate: (v: string) => v.length > 0 || "Required" },
      ]);

      const { localPath } = await inquirer.prompt<{ localPath: string }>([
        {
          type: "input",
          name: "localPath",
          message: "Local project path:",
          default: options.local || ".",
          filter: (v: string) => path.resolve(v),
          validate: (v: string) => fs.existsSync(path.resolve(v)) || "Path does not exist",
        },
      ]);

      const resolvedPath = path.resolve(localPath);
      const rc = loadProjectDeployrc(resolvedPath);
      const detected = detectProjectType(resolvedPath);
      const detectedLabel = detected ? getProjectDisplayName(detected) : "unknown";

      const { projectType } = await inquirer.prompt<{ projectType: string }>([
        {
          type: "list",
          name: "projectType",
          message: `Project type (detected: ${detectedLabel}):`,
          choices: [
            { name: "Node.js", value: "node" },
            { name: "Python", value: "python" },
            { name: "Rust", value: "rust" },
            { name: "Go", value: "go" },
            { name: "Docker", value: "docker" },
            { name: "PHP", value: "php" },
            { name: "Other", value: "other" },
          ],
          default: rc?.projectType || detected?.type || "node",
        },
      ]);

      const { buildCommand } = await inquirer.prompt<{ buildCommand: string }>([
        { type: "input", name: "buildCommand", message: "Build command:", default: rc?.buildCommand || detected?.buildCommand || "pnpm build" },
      ]);

      const { buildPath } = await inquirer.prompt<{ buildPath: string }>([
        { type: "input", name: "buildPath", message: "Build output path:", default: rc?.buildPath || detected?.buildPath || "./dist" },
      ]);

      const { installCommand } = await inquirer.prompt<{ installCommand: string }>([
        { type: "input", name: "installCommand", message: "Install command (e.g. pnpm install):", default: rc?.installCommand || detected?.installCommand || "" },
      ]);

      const defaultRemote = rc?.remoteUser && rc?.remoteHost && rc?.remotePath
        ? `${rc.remoteUser}@${rc.remoteHost}:${rc.remotePath}`
        : "";
      const { remote } = await inquirer.prompt<{ remote: string }>([
        {
          type: "input",
          name: "remote",
          message: "Remote destination (user@host:/path):",
          default: defaultRemote,
          validate: (v: string) => (v.includes("@") && v.includes(":")) || "Use format user@host:/path",
        },
      ]);

      const defaultKey = path.join(os.homedir(), ".ssh", "id_rsa");
      const { sshKey } = await inquirer.prompt<{ sshKey: string }>([
        { type: "input", name: "sshKey", message: "SSH private key path:", default: rc?.sshKey || (fs.existsSync(defaultKey) ? defaultKey : "~/.ssh/id_rsa") },
      ]);

      console.log();
      logger.section("Summary");
      logger.info(`Name:           ${name}`);
      logger.info(`Local:          ${resolvedPath}`);
      logger.info(`Type:           ${projectType}`);
      logger.info(`Build command:  ${buildCommand}`);
      logger.info(`Build path:     ${buildPath}`);
      logger.info(`Remote:         ${remote}`);
      logger.info(`SSH key:        ${sshKey}`);
      console.log();

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        { type: "confirm", name: "confirm", message: "Register this project?", default: true },
      ]);
      if (!confirm) {
        logger.info("Cancelled.");
        return;
      }

      const project = registerProject({
        name,
        localPath: resolvedPath,
        remote,
        buildCommand,
        buildPath,
        installCommand,
        projectType,
        framework: detected?.framework ?? undefined,
        sshKey,
      });
      logger.success(`Project "${project.name}" registered!`);
      logger.info(`Run 'remotry deploy ${project.name}' to deploy.`);
    } catch (error) {
      if ((error as { isTtyError?: boolean }).isTtyError) {
        logger.error("Terminal does not support interactive mode. Use 'remotry register' instead.");
      } else {
        logger.error(error instanceof Error ? error.message : "Unknown error");
      }
      process.exit(1);
    }
  });
