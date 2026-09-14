import { Command } from "commander";
import { registerProject } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";

interface RegisterOptions {
  local?: string;
  remote?: string;
  buildPath?: string;
  buildCommand?: string;
  installCommand?: string;
  type?: string;
  framework?: string;
  port?: string;
  key?: string;
  update?: boolean;
}

export const registerCommand = new Command("register")
  .description("Register a new project or update an existing one")
  .argument("<name>", "Project name")
  .option("--local <path>", "Local project path")
  .option("--remote <path>", "Remote destination path (user@host:/path)")
  .option("--build-path <path>", "Build output path")
  .option("--build-command <cmd>", "Build command to execute")
  .option("--install-command <cmd>", "Install/dependencies command")
  .option("--type <type>", "Project type (node, python, rust, go, docker, php)")
  .option("--framework <framework>", "Framework (next, vite, angular, etc.)")
  .option("--port <port>", "SSH port", "22")
  .option("--key <path>", "SSH private key path (~/.ssh/id_rsa)")
  .option("-u, --update", "Update existing project")
  .action((name: string, options: RegisterOptions) => {
    try {
      const project = registerProject({
        name,
        localPath: options.local || ".",
        remote: options.remote || "",
        buildCommand: options.buildCommand,
        buildPath: options.buildPath,
        installCommand: options.installCommand,
        projectType: options.type,
        framework: options.framework,
        sshKey: options.key,
        remotePort: options.port ? parseInt(options.port, 10) : undefined,
        update: options.update,
      });
      logger.success(`Project "${project.name}" ${options.update ? "updated" : "registered"} successfully`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : "Unknown error");
      process.exit(1);
    }
  });
