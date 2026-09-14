export * from "./types";
export * from "./events";
export { CredentialsRequiredError, AuthenticationError } from "./errors";
export { hintForError } from "./hints";
export { usesNextStandalone, isNextBuildOutput } from "./nextStandalone";
export { defaultRemoteBackupPath } from "./remote";
export type { ErrorHint, HintAction, HintContext } from "./hints";
export {
  testConnection,
  verifyCredentials,
  requiredCredential,
  credentialsFromEnv,
  credentialEnvVarNames,
  resolveAgentSocket,
  defaultBackupPath,
  validateFolderTarget,
} from "./connection";
export type { ConnectionTarget, ConnectionTestResult } from "./connection";
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
export { PRE_REMOTRY_RELEASE } from "./folder";
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
export { rollbackProject, getProjectReleases } from "./actions/rollback";
export type { RollbackOptions, RollbackResult, ProjectReleases } from "./actions/rollback";
export { deployAll } from "./actions/deployAll";
export type { DeployAllOptions } from "./actions/deployAll";
