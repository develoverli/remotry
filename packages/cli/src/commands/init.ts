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
  defaultBackupPath,
  defaultRemoteBackupPath,
  Activation,
  AuthMethod,
  TargetType,
} from "@develoverli/remotry-core";
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

      const { targetType } = await inquirer.prompt<{ targetType: TargetType }>([
        {
          type: "list",
          name: "targetType",
          message: "Deploy target:",
          choices: [
            { name: "SSH server", value: "ssh" },
            { name: "Local or network folder (e.g. \\\\server\\site)", value: "folder" },
          ],
          default: rc?.targetType || "ssh",
        },
      ]);

      let remote: string | undefined;
      let authMethod: AuthMethod | undefined;
      let sshKey: string | undefined;
      let folderPath: string | undefined;
      let backupPath: string | undefined;
      let activation: Activation | undefined;

      if (targetType === "ssh") {
        const defaultRemote = rc?.remoteUser && rc?.remoteHost && rc?.remotePath
          ? `${rc.remoteUser}@${rc.remoteHost}:${rc.remotePath}`
          : "";
        ({ remote } = await inquirer.prompt<{ remote: string }>([
          {
            type: "input",
            name: "remote",
            message: "Remote destination (user@host:/path):",
            default: defaultRemote,
            validate: (v: string) => (v.includes("@") && v.includes(":")) || "Use format user@host:/path",
          },
        ]));

        ({ authMethod } = await inquirer.prompt<{ authMethod: AuthMethod }>([
          {
            type: "list",
            name: "authMethod",
            message: "How does the server authenticate you?",
            choices: [
              { name: "SSH key file", value: "key" },
              { name: "Password (asked at deploy, never saved)", value: "password" },
              { name: "ssh-agent (keys already loaded, no prompt)", value: "agent" },
            ],
            default: rc?.authMethod || "key",
          },
        ]));

        ({ activation } = await inquirer.prompt<{ activation: Activation }>([
          {
            type: "list",
            name: "activation",
            message: "Where does your app run from on the server?",
            choices: [
              { name: "Directly from the remote path (files are copied there)", value: "copy" },
              { name: "From <remote path>/current (symlink, instant switch)", value: "symlink" },
            ],
            default: rc?.activation || "copy",
          },
        ]));

        if (activation === "copy") {
          const remotePathOnly = (remote ?? "").split(":").slice(1).join(":");
          ({ backupPath } = await inquirer.prompt<{ backupPath: string }>([
            {
              type: "input",
              name: "backupPath",
              message: "Keep releases for rollback in (must be outside the remote path):",
              default: rc?.backupPath || defaultRemoteBackupPath(remotePathOnly),
            },
          ]));
        }

        if (authMethod === "key") {
          const defaultKey = path.join(os.homedir(), ".ssh", "id_rsa");
          ({ sshKey } = await inquirer.prompt<{ sshKey: string }>([
            { type: "input", name: "sshKey", message: "SSH private key path:", default: rc?.sshKey || (fs.existsSync(defaultKey) ? defaultKey : "~/.ssh/id_rsa") },
          ]));
        }
      } else {
        ({ folderPath } = await inquirer.prompt<{ folderPath: string }>([
          {
            type: "input",
            name: "folderPath",
            message: "Target folder (local path or network share):",
            default: rc?.folderPath,
            validate: (v: string) => v.trim().length > 0 || "Required",
          },
        ]));
        ({ backupPath } = await inquirer.prompt<{ backupPath: string }>([
          {
            type: "input",
            name: "backupPath",
            message: "Keep releases for rollback in (must be outside the target folder):",
            default: rc?.backupPath || defaultBackupPath(folderPath),
          },
        ]));
      }

      const { postDeployCommand } = await inquirer.prompt<{ postDeployCommand: string }>([
        {
          type: "input",
          name: "postDeployCommand",
          message: "Command to run after each deploy (optional, e.g. pm2 restart my-app):",
          default: rc?.postDeployCommand || "",
        },
      ]);

      console.log();
      logger.section("Summary");
      logger.info(`Name:           ${name}`);
      logger.info(`Local:          ${resolvedPath}`);
      logger.info(`Type:           ${projectType}`);
      logger.info(`Build command:  ${buildCommand}`);
      logger.info(`Build path:     ${buildPath}`);
      logger.info(`Target:         ${targetType === "folder" ? folderPath : remote}`);
      if (targetType === "ssh") logger.info(`Auth:           ${authMethod}${sshKey ? ` (${sshKey})` : ""}`);
      if (activation) logger.info(`Activation:     ${activation}`);
      if (backupPath) logger.info(`Releases:       ${backupPath}`);
      if (postDeployCommand) logger.info(`After deploy:   ${postDeployCommand}`);
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
        targetType,
        authMethod,
        folderPath,
        backupPath,
        activation,
        postDeployCommand,
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
