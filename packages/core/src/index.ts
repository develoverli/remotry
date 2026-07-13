export * from "./types";
export * from "./events";
export { store, Store } from "./store";
export {
  detectProjectType,
  detectPackageManager,
  pmCommands,
  getProjectDisplayName,
} from "./detector";
export type { DetectedProject, PackageManager } from "./detector";
export {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectDeployrc,
  saveProjectDeployrc,
  getGlobalConfigPath,
} from "./deployrc";
export type { GlobalConfig, ProjectDeployrc } from "./deployrc";
export { SSHClient, parseSSHUrl, resolveHome } from "./ssh";
export type { SSHConfig, ParsedSSH } from "./ssh";

export { registerProject, parseRemote } from "./actions/register";
export type { RegisterInput, ParsedRemote } from "./actions/register";
export { deployProject } from "./actions/deploy";
export type { DeployOptions } from "./actions/deploy";
export { listProjects, listProjectNames } from "./actions/list";
export { removeProject } from "./actions/remove";
export { getProjectStatus, relativeTime } from "./actions/status";
export type { ProjectStatus } from "./actions/status";
export { updateProject } from "./actions/update";
export type { ProjectPatch } from "./actions/update";
export { rollbackProject } from "./actions/rollback";
export type { RollbackOptions, RollbackResult } from "./actions/rollback";
export { deployAll } from "./actions/deployAll";
export type { DeployAllOptions } from "./actions/deployAll";
