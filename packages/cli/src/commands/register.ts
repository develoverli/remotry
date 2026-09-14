import { Command, Option } from "commander";
import { Activation, AuthMethod, TargetType, UploadMode, registerProject } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";

interface RegisterOptions {
  local?: string;
  remote?: string;
  targetType?: TargetType;
  auth?: AuthMethod;
  folder?: string;
  backupPath?: string;
  activation?: Activation;
  uploadMode?: UploadMode;
  postDeploy?: string;
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
  .addOption(new Option("--target-type <type>", "Deploy target: SSH server or local/network folder").choices(["ssh", "folder"]))
  .option("--remote <path>", "Remote destination path (user@host:/path), for ssh targets")
  .addOption(
    new Option("--auth <method>", "SSH auth: key file, password (prompted at deploy), or ssh-agent").choices(["key", "password", "agent"])
  )
  .option("--folder <path>", "Target folder (local path or UNC share), for folder targets")
  .option("--backup-path <path>", "Where releases are kept for rollback (default: <target>.remotry-releases)")
  .addOption(
    new Option("--activation <mode>", "SSH: copy files into the remote path, or use a current symlink").choices(["copy", "symlink"])
  )
  .addOption(new Option("--upload-mode <mode>", "SSH: upload one compressed archive, or file by file").choices(["archive", "files"]))
  .option("--post-deploy <cmd>", "Command to run after a release goes live (server for SSH, this machine for folders)")
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
        remote: options.remote,
        targetType: options.targetType ?? (options.folder && !options.remote ? "folder" : undefined),
        authMethod: options.auth,
        folderPath: options.folder,
        backupPath: options.backupPath,
        activation: options.activation,
        uploadMode: options.uploadMode,
        postDeployCommand: options.postDeploy,
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
