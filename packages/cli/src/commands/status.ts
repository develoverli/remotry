import { Command } from "commander";
import { getProjectStatus } from "remotry-core";
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
      logger.info(`Remote:   ${project.remoteUser}@${project.remoteHost}:${project.remotePath}`);
      logger.info(`Build:    ${project.buildCommand}`);
      logger.info(`Output:   ${project.buildPath}`);

      if (neverDeployed) {
        logger.warn("Never deployed");
      } else {
        logger.success(`Last deploy: ${lastDeployRelative}`);
      }
      const created = new Date(project.createdAt).toLocaleString();
      logger.dim(`Registered: ${created}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Unknown error");
      process.exit(1);
    }
  });
