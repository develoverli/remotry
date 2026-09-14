import { Command } from "commander";
import { activationOf, authMethodOf, describeTarget, getProjectStatus, targetTypeOf, uploadModeOf } from "@develoverli/remotry-core";
import { logger } from "../utils/logger";

export const statusCommand = new Command("status")
  .description("Show deployment status of a project")
  .argument("<name>", "Project name")
  .action((name: string) => {
    try {
      const { project, lastDeployRelative, neverDeployed } = getProjectStatus(name);
      logger.section(`Status: ${name}`);
      const typeLabel = project.framework ? `${project.projectType}/${project.framework}` : project.projectType;
      logger.info(`Type:     ${typeLabel}`);
      logger.info(`Local:    ${project.localPath}`);
      logger.info(`Target:   ${describeTarget(project)}`);
      if (targetTypeOf(project) === "ssh") {
        logger.info(`Auth:     ${authMethodOf(project)}`);
        logger.info(`Mode:     ${activationOf(project)} activation, ${uploadModeOf(project)} upload`);
      }
      if (project.backupPath) logger.info(`Releases: ${project.backupPath}`);
      if (project.postDeployCommand) logger.info(`After:    ${project.postDeployCommand}`);
      logger.info(`Build:    ${project.buildCommand}`);
      logger.info(`Output:   ${project.buildPath}`);

      if (neverDeployed) {
        logger.warn("Never deployed");
      } else {
        logger.success(`Last deploy: ${lastDeployRelative}`);
      }
      if (project.lastDeployStatus === "failed") {
        logger.error(`Last attempt failed: ${project.lastDeployError ?? "unknown error"}`);
      }
      const created = new Date(project.createdAt).toLocaleString();
      logger.dim(`Registered: ${created}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
