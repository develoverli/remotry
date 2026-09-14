import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  registerProject,
  detectProjectType,
  loadProjectDeployrc,
  saveProjectDeployrc,
  testConnection,
  defaultBackupPath,
  defaultRemoteBackupPath,
  store,
  Activation,
  AuthMethod,
  ConnectionTarget,
  Credentials,
  CredentialsRequiredError,
  RegisterInput,
  TargetType,
  UploadMode,
} from "@develoverli/remotry-core";
import { DeployState } from "../deployState";
import { CredentialVault } from "../credentials";
import { hintFor } from "../hints";

interface FormDefaults {
  name: string;
  localPath: string;
  targetType: TargetType;
  authMethod: AuthMethod;
  remoteUser: string;
  remoteHost: string;
  remotePath: string;
  remotePort: number;
  folderPath: string;
  backupPath: string;
  activation: Activation;
  uploadMode: UploadMode;
  postDeployCommand: string;
  buildCommand: string;
  buildPath: string;
  installCommand: string;
  projectType: string;
  framework: string;
  sshKey: string;
  detectedType: string;
  saveToWorkspace: boolean;
  /** The project folder already has a .deployrc, which is kept in sync on save. */
  hasDeployrc: boolean;
  isEdit: boolean;
  hasSavedPassword: boolean;
  hasSavedPassphrase: boolean;
}

type FormValue = string | boolean | number;
type FormData = Record<string, FormValue>;

const str = (data: FormData, key: string): string => String(data[key] ?? "").trim();

export async function openRegisterForm(
  _context: vscode.ExtensionContext,
  state: DeployState,
  vault: CredentialVault,
  editName?: string
): Promise<void> {
  const config = vscode.workspace.getConfiguration("deploy");
  const defaultUser = config.get<string>("defaultRemoteUser", "root");
  const defaultBase = config.get<string>("defaultRemoteBase", "/var/www");
  const defaultSshKey = config.get<string>("sshKey", "~/.ssh/id_rsa");

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const defaults = buildDefaults({
    editName,
    workspaceFolder,
    defaultUser,
    defaultBase,
    defaultSshKey,
  });
  if (defaults.isEdit) {
    defaults.hasSavedPassword = await vault.has(defaults.name, "password");
    defaults.hasSavedPassphrase = await vault.has(defaults.name, "passphrase");
  }

  const panel = vscode.window.createWebviewPanel(
    "deployRegister",
    defaults.isEdit ? `Edit: ${editName}` : "Register Deploy Project",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = renderHtml(defaults);

  const pick = async (field: string, options: vscode.OpenDialogOptions) => {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, ...options });
    if (picked && picked[0]) {
      panel.webview.postMessage({ type: "set-field", field, value: picked[0].fsPath });
    }
  };

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "submit") {
      await handleSubmit(msg.data, panel, state, vault, defaults.isEdit);
    } else if (msg.type === "test") {
      await handleTest(msg.data, panel, vault);
    } else if (msg.type === "detect") {
      const newDefaults = redetect(msg.localPath, defaults);
      panel.webview.postMessage({ type: "prefill", data: newDefaults });
    } else if (msg.type === "pick-path") {
      await pick("localPath", { canSelectFolders: true, canSelectFiles: false, openLabel: "Select project folder" });
    } else if (msg.type === "pick-key") {
      await pick("sshKey", { canSelectFolders: false, canSelectFiles: true, openLabel: "Select SSH private key" });
    } else if (msg.type === "pick-folder") {
      await pick("folderPath", { canSelectFolders: true, canSelectFiles: false, openLabel: "Deploy into this folder" });
    } else if (msg.type === "pick-backup") {
      await pick("backupPath", { canSelectFolders: true, canSelectFiles: false, openLabel: "Keep releases here" });
    } else if (msg.type === "cancel") {
      panel.dispose();
    }
  });
}

function buildDefaults(opts: {
  editName?: string;
  workspaceFolder?: string;
  defaultUser: string;
  defaultBase: string;
  defaultSshKey: string;
}): FormDefaults {
  const base: FormDefaults = {
    name: "",
    localPath: opts.workspaceFolder ?? "",
    targetType: "ssh",
    authMethod: "key",
    remoteUser: opts.defaultUser,
    remoteHost: "",
    remotePath: opts.defaultBase,
    remotePort: 22,
    folderPath: "",
    backupPath: "",
    activation: "copy",
    uploadMode: "archive",
    postDeployCommand: "",
    buildCommand: "pnpm build",
    buildPath: "./dist",
    installCommand: "",
    projectType: "node",
    framework: "",
    sshKey: opts.defaultSshKey,
    detectedType: "unknown",
    saveToWorkspace: false,
    hasDeployrc: false,
    isEdit: false,
    hasSavedPassword: false,
    hasSavedPassphrase: false,
  };

  if (opts.editName) {
    const existing = store.getProject(opts.editName);
    if (existing) {
      base.isEdit = true;
      base.name = existing.name;
      base.localPath = existing.localPath;
      base.targetType = existing.targetType ?? "ssh";
      base.authMethod = existing.authMethod ?? "key";
      base.remoteUser = existing.remoteUser || base.remoteUser;
      base.remoteHost = existing.remoteHost;
      base.remotePath = existing.remotePath || base.remotePath;
      base.remotePort = existing.remotePort;
      base.folderPath = existing.folderPath ?? "";
      base.backupPath = existing.backupPath ?? "";
      // Projects registered before 1.1.0 use the `current` symlink.
      base.activation = existing.activation ?? "symlink";
      base.uploadMode = existing.uploadMode ?? "archive";
      base.postDeployCommand = existing.postDeployCommand ?? "";
      base.buildCommand = existing.buildCommand;
      base.buildPath = existing.buildPath;
      base.installCommand = existing.installCommand ?? "";
      base.projectType = existing.projectType;
      base.framework = existing.framework ?? "";
      base.sshKey = existing.sshKey || opts.defaultSshKey;
      base.detectedType = existing.framework ? `${existing.projectType}/${existing.framework}` : existing.projectType;
      base.hasDeployrc = hasDeployrc(existing.localPath);
    }
  } else if (opts.workspaceFolder) {
    const rc = loadProjectDeployrc(opts.workspaceFolder);
    base.hasDeployrc = hasDeployrc(opts.workspaceFolder);
    const detected = detectProjectType(opts.workspaceFolder);
    base.name = path.basename(opts.workspaceFolder);
    base.detectedType = detected ? `${detected.type}${detected.framework ? "/" + detected.framework : ""}` : "unknown";

    if (rc) {
      base.name = rc.name ?? base.name;
      base.localPath = rc.localPath ?? base.localPath;
      base.targetType = rc.targetType ?? base.targetType;
      base.authMethod = rc.authMethod ?? base.authMethod;
      base.remoteHost = rc.remoteHost ?? base.remoteHost;
      base.remoteUser = rc.remoteUser ?? base.remoteUser;
      base.remotePath = rc.remotePath ?? base.remotePath;
      base.remotePort = rc.remotePort ?? base.remotePort;
      base.folderPath = rc.folderPath ?? base.folderPath;
      base.backupPath = rc.backupPath ?? base.backupPath;
      base.activation = rc.activation ?? base.activation;
      base.uploadMode = rc.uploadMode ?? base.uploadMode;
      base.postDeployCommand = rc.postDeployCommand ?? base.postDeployCommand;
      base.buildCommand = rc.buildCommand ?? base.buildCommand;
      base.buildPath = rc.buildPath ?? base.buildPath;
      base.installCommand = rc.installCommand ?? base.installCommand;
      base.projectType = rc.projectType ?? base.projectType;
      base.framework = rc.framework ?? base.framework;
      base.sshKey = rc.sshKey ?? base.sshKey;
    } else if (detected) {
      base.buildCommand = detected.buildCommand;
      base.buildPath = detected.buildPath;
      base.installCommand = detected.installCommand;
      base.projectType = detected.type;
      base.framework = detected.framework ?? "";
    }
  }

  return base;
}

const DEPLOYRC_FILE = ".deployrc";

function hasDeployrc(projectPath: string): boolean {
  return !!projectPath && fs.existsSync(path.join(projectPath, DEPLOYRC_FILE));
}

function redetect(localPath: string, _base: FormDefaults): Partial<FormDefaults> {
  if (!localPath || !fs.existsSync(localPath)) return {};
  const rc = loadProjectDeployrc(localPath);
  const detected = detectProjectType(localPath);
  const result: Partial<FormDefaults> = {
    detectedType: detected ? `${detected.type}${detected.framework ? "/" + detected.framework : ""}` : "unknown",
    name: rc?.name ?? path.basename(localPath),
    hasDeployrc: hasDeployrc(localPath),
  };
  if (rc) {
    if (rc.buildCommand) result.buildCommand = rc.buildCommand;
    if (rc.buildPath) result.buildPath = rc.buildPath;
    if (rc.installCommand) result.installCommand = rc.installCommand;
    if (rc.projectType) result.projectType = rc.projectType;
    if (rc.framework) result.framework = rc.framework;
    if (rc.targetType) result.targetType = rc.targetType;
    if (rc.authMethod) result.authMethod = rc.authMethod;
    if (rc.remoteHost) result.remoteHost = rc.remoteHost;
    if (rc.remoteUser) result.remoteUser = rc.remoteUser;
    if (rc.remotePath) result.remotePath = rc.remotePath;
    if (rc.remotePort) result.remotePort = rc.remotePort;
    if (rc.folderPath) result.folderPath = rc.folderPath;
    if (rc.backupPath) result.backupPath = rc.backupPath;
    if (rc.activation) result.activation = rc.activation;
    if (rc.uploadMode) result.uploadMode = rc.uploadMode;
    if (rc.postDeployCommand) result.postDeployCommand = rc.postDeployCommand;
    if (rc.sshKey) result.sshKey = rc.sshKey;
  } else if (detected) {
    result.buildCommand = detected.buildCommand;
    result.buildPath = detected.buildPath;
    result.installCommand = detected.installCommand;
    result.projectType = detected.type;
    result.framework = detected.framework ?? "";
  }
  return result;
}

function targetTypeFrom(data: FormData): TargetType {
  return str(data, "targetType") === "folder" ? "folder" : "ssh";
}

function activationFrom(data: FormData): Activation {
  return str(data, "activation") === "symlink" ? "symlink" : "copy";
}

function uploadModeFrom(data: FormData): UploadMode {
  return str(data, "uploadMode") === "files" ? "files" : "archive";
}

function authMethodFrom(data: FormData): AuthMethod {
  const value = str(data, "authMethod");
  return value === "password" || value === "agent" ? value : "key";
}

function connectionTargetFrom(data: FormData): ConnectionTarget {
  return {
    name: str(data, "name") || "project",
    targetType: targetTypeFrom(data),
    authMethod: authMethodFrom(data),
    remoteUser: str(data, "remoteUser"),
    remoteHost: str(data, "remoteHost"),
    remotePort: Number(data.remotePort) || 22,
    remotePath: str(data, "remotePath"),
    sshKey: str(data, "sshKey") || undefined,
    folderPath: str(data, "folderPath") || undefined,
    backupPath: str(data, "backupPath") || undefined,
    activation: activationFrom(data),
  };
}

async function handleTest(data: FormData, panel: vscode.WebviewPanel, vault: CredentialVault) {
  const target = connectionTargetFrom(data);
  const saved = target.name ? await vault.get(target.name) : {};
  const credentials: Credentials = {
    password: str(data, "password") || saved.password,
    passphrase: str(data, "passphrase") || saved.passphrase,
  };
  panel.webview.postMessage({ type: "test-result", state: "busy", message: "Testing connection..." });
  try {
    const result = await testConnection(target, credentials);
    const hint = result.ok ? undefined : hintFor(target, result.message);
    panel.webview.postMessage({
      type: "test-result",
      state: result.ok ? "ok" : "fail",
      message: result.message,
      hint: hint && { title: hint.title, steps: hint.steps },
    });
  } catch (err) {
    const message =
      err instanceof CredentialsRequiredError
        ? err.kind === "password"
          ? "Enter the password to test the connection."
          : "This SSH key has a passphrase. Enter it to test the connection."
        : err instanceof Error
          ? err.message
          : "Unknown error";
    panel.webview.postMessage({ type: "test-result", state: "fail", message });
  }
}

async function handleSubmit(
  data: FormData,
  panel: vscode.WebviewPanel,
  state: DeployState,
  vault: CredentialVault,
  isEdit: boolean
) {
  const targetType = targetTypeFrom(data);
  const authMethod = authMethodFrom(data);
  const input: RegisterInput = {
    name: str(data, "name"),
    localPath: str(data, "localPath"),
    targetType,
    authMethod,
    remote:
      targetType === "ssh" ? `${str(data, "remoteUser")}@${str(data, "remoteHost")}:${str(data, "remotePath")}` : undefined,
    folderPath: targetType === "folder" ? str(data, "folderPath") : undefined,
    backupPath: targetType === "folder" || activationFrom(data) === "copy" ? str(data, "backupPath") || undefined : undefined,
    activation: activationFrom(data),
    uploadMode: uploadModeFrom(data),
    postDeployCommand: str(data, "postDeployCommand"),
    buildCommand: str(data, "buildCommand") || undefined,
    buildPath: str(data, "buildPath") || undefined,
    installCommand: str(data, "installCommand") || undefined,
    projectType: str(data, "projectType") || undefined,
    framework: str(data, "framework") || undefined,
    sshKey: str(data, "sshKey") || undefined,
    remotePort: Number(data.remotePort) || 22,
    update: isEdit,
  };

  try {
    const project = registerProject(input);

    // Secrets go to the OS keychain only; clear the ones the chosen auth method no longer uses.
    const password = str(data, "password");
    const passphrase = str(data, "passphrase");
    if (targetType === "ssh" && authMethod === "password") {
      if (password) await vault.store(project.name, "password", password);
    } else {
      await vault.forget(project.name, "password");
    }
    if (targetType === "ssh" && authMethod === "key") {
      if (passphrase) await vault.store(project.name, "passphrase", passphrase);
    } else {
      await vault.forget(project.name, "passphrase");
    }

    // An existing .deployrc is always kept in sync, so it never drifts from the saved project.
    if (data.saveToWorkspace || hasDeployrc(input.localPath)) {
      saveProjectDeployrc(input.localPath, {
        name: project.name,
        localPath: project.localPath,
        targetType: project.targetType,
        authMethod: project.authMethod,
        remoteHost: project.remoteHost || undefined,
        remotePort: targetType === "ssh" ? project.remotePort : undefined,
        remoteUser: project.remoteUser || undefined,
        remotePath: project.remotePath || undefined,
        folderPath: project.folderPath,
        backupPath: project.backupPath,
        activation: project.activation,
        uploadMode: project.uploadMode,
        postDeployCommand: project.postDeployCommand,
        buildCommand: project.buildCommand,
        buildPath: project.buildPath,
        installCommand: project.installCommand,
        projectType: project.projectType,
        framework: project.framework,
        sshKey: project.sshKey,
      });
    }

    state.changed();
    panel.dispose();
    void vscode.window
      .showInformationMessage(`Project "${project.name}" ${isEdit ? "updated" : "registered"}.`, "Deploy Now")
      .then((choice) => (choice === "Deploy Now" ? vscode.commands.executeCommand("deploy.deploy", project.name) : undefined));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    panel.webview.postMessage({ type: "error", message: msg });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(d: FormDefaults): string {
  const home = os.homedir();
  const title = d.isEdit ? `Edit: ${escapeHtml(d.name)}` : "Register Deploy Project";
  const checked = (cond: boolean) => (cond ? "checked" : "");
  const selected = (cond: boolean) => (cond ? "selected" : "");
  const backupPlaceholder =
    d.targetType === "folder" && d.folderPath
      ? defaultBackupPath(d.folderPath)
      : d.remotePath
        ? defaultRemoteBackupPath(d.remotePath)
        : "Defaults to <target>.remotry-releases";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${title}</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px;
    max-width: 720px;
    margin: 0 auto;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 6px;
    flex-wrap: wrap;
  }
  h1 { font-size: 1.4em; margin: 0; }
  .subtitle { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 24px; }
  .detected-pill {
    display: inline-block;
    padding: 3px 12px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border: 1px solid var(--vscode-contrastBorder, transparent);
    border-radius: 10px;
    font-size: 0.85em;
    margin-left: 8px;
  }
  fieldset {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 14px 16px;
    margin: 0 0 16px;
  }
  legend {
    padding: 0 6px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .row {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }
  .row label { font-size: 0.9em; color: var(--vscode-descriptionForeground); }
  input, select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 8px;
    border-radius: 3px;
    font-family: var(--vscode-font-family);
    font-size: 0.95em;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus, select:focus, button:focus-visible, .choice input:focus-visible + span {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  .inline {
    display: flex;
    gap: 6px;
  }
  .inline input { flex: 1; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 16px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.95em;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.small { padding: 4px 10px; font-size: 0.85em; }
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
    flex-wrap: wrap;
  }
  .actions .spacer { flex: 1; }
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .checkbox-row input { width: auto; }
  .deployrc-existing { font-size: 0.9em; color: var(--vscode-descriptionForeground); }
  .error {
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    padding: 8px 12px;
    border-radius: 3px;
    margin-bottom: 14px;
  }
  .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin: -4px 0 10px 150px; }
  .remote-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 80px;
    gap: 8px;
    margin-bottom: 10px;
  }
  .remote-grid label { font-size: 0.8em; color: var(--vscode-descriptionForeground); display: block; margin-bottom: 4px; }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 14px;
  }
  .choice { position: relative; display: block; cursor: pointer; }
  .choice input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .choice span {
    display: block;
    padding: 10px 12px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 6px;
    background: var(--vscode-input-background);
  }
  .choice strong { display: block; font-weight: 600; }
  .choice small { color: var(--vscode-descriptionForeground); }
  .choice input:checked + span {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground, var(--vscode-input-background));
    color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
  }
  .choice input:checked + span small { color: inherit; opacity: 0.85; }
  .test-status { font-size: 0.9em; flex-basis: 100%; order: 10; }
  .test-status:empty { display: none; }
  .test-hint {
    flex-basis: 100%;
    order: 11;
    padding: 8px 12px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-textBlockQuote-background, transparent);
    font-size: 0.9em;
    line-height: 1.45;
  }
  .test-hint strong { display: block; margin-bottom: 4px; }
  .test-hint ol { margin: 0; padding-left: 20px; }
  .test-status.ok { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
  .test-status.fail { color: var(--vscode-errorForeground); }
  .test-status.busy { color: var(--vscode-descriptionForeground); }
  @media (max-width: 520px) {
    .row { grid-template-columns: 1fr; gap: 4px; }
    .hint { margin-left: 0; }
    .remote-grid, .choices { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="title-row">
    <h1>${title}</h1>
    <span class="detected-pill" id="detectedPill">${escapeHtml(d.detectedType)}</span>
  </div>
  <div class="subtitle">${d.isEdit ? "Update project configuration." : "Register a new deploy target. Fields prefilled from <code>.deployrc</code> or detected project type."}</div>

  <div class="error" id="errorBox" role="alert" hidden></div>

  <form id="form">
    <fieldset>
      <legend>Project</legend>
      <div class="row">
        <label for="name">Name</label>
        <input id="name" type="text" value="${escapeHtml(d.name)}" required ${d.isEdit ? "readonly" : ""} placeholder="my-app" />
      </div>
      <div class="row">
        <label for="localPath">Local path</label>
        <div class="inline">
          <input id="localPath" type="text" value="${escapeHtml(d.localPath)}" required placeholder="/path/to/project" />
          <button type="button" class="secondary small" data-pick="pick-path">Browse</button>
        </div>
      </div>
      <div class="row">
        <label for="projectType">Type</label>
        <select id="projectType">
          <option value="node">Node.js</option>
          <option value="python">Python</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
          <option value="docker">Docker</option>
          <option value="php">PHP</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="row">
        <label for="framework">Framework</label>
        <input id="framework" type="text" value="${escapeHtml(d.framework)}" placeholder="next, vite, angular... (optional)" />
      </div>
    </fieldset>

    <fieldset>
      <legend>Build</legend>
      <div class="row">
        <label for="installCommand">Install cmd</label>
        <input id="installCommand" type="text" value="${escapeHtml(d.installCommand)}" placeholder="pnpm install (optional, skipped if empty)" />
      </div>
      <div class="row">
        <label for="buildCommand">Build cmd</label>
        <input id="buildCommand" type="text" value="${escapeHtml(d.buildCommand)}" required placeholder="pnpm build" />
      </div>
      <div class="row">
        <label for="buildPath">Build output</label>
        <input id="buildPath" type="text" value="${escapeHtml(d.buildPath)}" required placeholder="./dist" />
      </div>
    </fieldset>

    <fieldset>
      <legend>Deploy to</legend>
      <div class="choices" role="radiogroup" aria-label="Deploy target">
        <label class="choice">
          <input type="radio" name="targetType" value="ssh" ${checked(d.targetType === "ssh")} />
          <span><strong>SSH server</strong><small>Upload over SSH/SFTP with rollback</small></span>
        </label>
        <label class="choice">
          <input type="radio" name="targetType" value="folder" ${checked(d.targetType === "folder")} />
          <span><strong>Folder</strong><small>Local disk or network share</small></span>
        </label>
      </div>

      <div id="sshPanel">
        <div class="remote-grid">
          <div>
            <label for="remoteUser">User</label>
            <input id="remoteUser" type="text" value="${escapeHtml(d.remoteUser)}" data-ssh-required placeholder="root" />
          </div>
          <div>
            <label for="remoteHost">Host</label>
            <input id="remoteHost" type="text" value="${escapeHtml(d.remoteHost)}" data-ssh-required placeholder="example.com or 192.168.1.20" />
          </div>
          <div>
            <label for="remotePort">Port</label>
            <input id="remotePort" type="number" value="${d.remotePort}" min="1" max="65535" />
          </div>
        </div>
        <div class="row">
          <label for="remotePath">Remote path</label>
          <input id="remotePath" type="text" value="${escapeHtml(d.remotePath)}" data-ssh-required placeholder="/var/www/my-app" />
        </div>
        <div class="row">
          <label for="authMethod">Sign in with</label>
          <select id="authMethod">
            <option value="key" ${selected(d.authMethod === "key")}>SSH key file</option>
            <option value="password" ${selected(d.authMethod === "password")}>Password</option>
            <option value="agent" ${selected(d.authMethod === "agent")}>ssh-agent (no prompt)</option>
          </select>
        </div>

        <div id="keyFields">
          <div class="row">
            <label for="sshKey">SSH key</label>
            <div class="inline">
              <input id="sshKey" type="text" value="${escapeHtml(d.sshKey)}" placeholder="${escapeHtml(path.join(home, ".ssh", "id_rsa"))}" />
              <button type="button" class="secondary small" data-pick="pick-key">Browse</button>
            </div>
          </div>
          <div class="row">
            <label for="passphrase">Key passphrase</label>
            <input id="passphrase" type="password" autocomplete="off" placeholder="${d.hasSavedPassphrase ? "Saved. Leave blank to keep it." : "Only if your key has one"}" />
          </div>
        </div>

        <div id="passwordFields">
          <div class="row">
            <label for="password">Password</label>
            <input id="password" type="password" autocomplete="off" placeholder="${d.hasSavedPassword ? "Saved. Leave blank to keep it." : "Leave blank to be asked on each deploy"}" />
          </div>
        </div>

        <div class="hint" id="authHint"></div>

        <div class="row">
          <label for="activation">App runs from</label>
          <select id="activation">
            <option value="copy" ${selected(d.activation === "copy")}>The remote path (files copied there)</option>
            <option value="symlink" ${selected(d.activation === "symlink")}>Remote path/current (symlink)</option>
          </select>
        </div>
        <div class="hint" id="activationHint"></div>
        <div class="row">
          <label for="uploadMode">Upload</label>
          <select id="uploadMode">
            <option value="archive" ${selected(d.uploadMode === "archive")}>One compressed archive (faster)</option>
            <option value="files" ${selected(d.uploadMode === "files")}>File by file</option>
          </select>
        </div>
      </div>

      <div id="folderPanel">
        <div class="row">
          <label for="folderPath">Target folder</label>
          <div class="inline">
            <input id="folderPath" type="text" value="${escapeHtml(d.folderPath)}" data-folder-required placeholder="\\\\server\\sites\\my-app or D:\\www\\my-app" />
            <button type="button" class="secondary small" data-pick="pick-folder">Browse</button>
          </div>
        </div>
      </div>

      <div id="releasesRow">
        <div class="row">
          <label for="backupPath">Releases folder</label>
          <div class="inline">
            <input id="backupPath" type="text" value="${escapeHtml(d.backupPath)}" placeholder="${escapeHtml(backupPlaceholder)}" />
            <button type="button" class="secondary small" id="pickBackup" data-pick="pick-backup">Browse</button>
          </div>
        </div>
        <div class="hint">Each deploy is kept here for rollback. Keep it outside the folder your app or web server serves.</div>
      </div>

      <div class="row">
        <label for="postDeployCommand">After deploy</label>
        <input id="postDeployCommand" type="text" value="${escapeHtml(d.postDeployCommand)}" placeholder="pm2 restart my-app (optional)" />
      </div>
      <div class="hint" id="postDeployHint"></div>
    </fieldset>

    <fieldset>
      <legend>Options</legend>
      <div class="checkbox-row">
        <input id="saveToWorkspace" type="checkbox" />
        <label for="saveToWorkspace">Also save <code>.deployrc</code> in workspace (commit-friendly, never includes passwords)</label>
      </div>
      <div class="deployrc-existing" id="deployrcExisting">
        Saved in <code>.deployrc</code> in the project folder. It is updated when you save (never includes passwords).
      </div>
    </fieldset>

    <div class="actions">
      <button type="button" class="secondary" id="test">Test connection</button>
      <span class="test-status" id="testStatus" role="status" aria-live="polite"></span>
      <div class="test-hint" id="testHint" hidden></div>
      <span class="spacer"></span>
      <button type="button" class="secondary" id="cancel">Cancel</button>
      <button type="submit" id="submit">${d.isEdit ? "Update" : "Register"}</button>
    </div>
  </form>

<script>
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const fields = ["name","localPath","projectType","framework","installCommand","buildCommand","buildPath","authMethod","remoteUser","remoteHost","remotePort","remotePath","sshKey","passphrase","password","folderPath","backupPath","activation","uploadMode","postDeployCommand","saveToWorkspace"];
  const AUTH_HINTS = {
    key: "Uses your private key file. A key passphrase is stored in your system keychain.",
    password: "Stored in your system keychain, never in project files.",
    agent: "Uses keys already loaded in ssh-agent (Pageant, OpenSSH agent, 1Password). Nothing to enter.",
  };

  $("projectType").value = ${JSON.stringify(d.projectType)};

  const targetType = () => document.querySelector('input[name="targetType"]:checked').value;

  function syncVisibility() {
    const isSsh = targetType() === "ssh";
    const auth = $("authMethod").value;
    $("sshPanel").hidden = !isSsh;
    $("folderPanel").hidden = isSsh;
    $("keyFields").hidden = auth !== "key";
    $("passwordFields").hidden = auth !== "password";
    $("authHint").textContent = AUTH_HINTS[auth];
    const copy = $("activation").value === "copy";
    $("activationHint").textContent = copy
      ? "Your app or web server keeps pointing at the remote path. Releases are kept in the releases folder."
      : "Point your app or web server at <remote path>/current. Switching releases is instant.";
    $("releasesRow").hidden = isSsh && !copy;
    $("pickBackup").hidden = isSsh;
    $("backupPath").placeholder = isSsh
      ? ($("remotePath").value.trim() ? $("remotePath").value.trim().replace(/\\/+$/, "") + ".remotry-releases" : "Defaults to <remote path>.remotry-releases")
      : ($("folderPath").value.trim() ? $("folderPath").value.trim().replace(/[\\\\/]+$/, "") + ".remotry-releases" : "Defaults to <folder>.remotry-releases");
    $("postDeployHint").textContent = isSsh
      ? "Runs on the server, inside the folder the app runs from."
      : "Runs on this computer, inside the target folder.";
    document.querySelectorAll("[data-ssh-required]").forEach((el) => { el.required = isSsh; });
    document.querySelectorAll("[data-folder-required]").forEach((el) => { el.required = !isSsh; });
  }

  function syncDeployrc(exists) {
    $("saveToWorkspace").closest(".checkbox-row").hidden = exists;
    $("deployrcExisting").hidden = !exists;
  }

  function collect() {
    const data = { targetType: targetType() };
    for (const f of fields) {
      const el = $(f);
      data[f] = el.type === "checkbox" ? el.checked : el.value;
    }
    return data;
  }

  function showError(message) {
    const box = $("errorBox");
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth" });
  }

  document.querySelectorAll('input[name="targetType"]').forEach((el) => el.addEventListener("change", syncVisibility));
  $("authMethod").addEventListener("change", syncVisibility);
  $("activation").addEventListener("change", syncVisibility);
  $("remotePath").addEventListener("input", syncVisibility);
  $("folderPath").addEventListener("input", syncVisibility);
  document.querySelectorAll("[data-pick]").forEach((el) =>
    el.addEventListener("click", () => vscode.postMessage({ type: el.dataset.pick }))
  );
  $("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
  $("test").addEventListener("click", () => {
    if (!$("form").reportValidity()) return;
    vscode.postMessage({ type: "test", data: collect() });
  });

  // Re-detect when localPath changes (debounced)
  let detectTimer;
  $("localPath").addEventListener("input", (e) => {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(() => vscode.postMessage({ type: "detect", localPath: e.target.value }), 400);
  });

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    $("errorBox").hidden = true;
    vscode.postMessage({ type: "submit", data: collect() });
  });

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "prefill") {
      const d = msg.data;
      if (d.detectedType !== undefined) $("detectedPill").textContent = d.detectedType;
      if (d.hasDeployrc !== undefined) syncDeployrc(d.hasDeployrc);
      if (d.targetType) document.querySelector('input[name="targetType"][value="' + d.targetType + '"]').checked = true;
      for (const f of fields) {
        if (d[f] !== undefined) {
          const el = $(f);
          if (el && el.type !== "checkbox" && el.type !== "password") el.value = d[f];
        }
      }
      syncVisibility();
    } else if (msg.type === "set-field") {
      const el = $(msg.field);
      el.value = msg.value;
      el.dispatchEvent(new Event("input"));
    } else if (msg.type === "test-result") {
      const status = $("testStatus");
      status.textContent = msg.message;
      status.className = "test-status " + msg.state;
      $("test").disabled = msg.state === "busy";
      const hintBox = $("testHint");
      hintBox.replaceChildren();
      hintBox.hidden = !msg.hint;
      if (msg.hint) {
        const title = document.createElement("strong");
        title.textContent = "How to fix: " + msg.hint.title;
        const list = document.createElement("ol");
        for (const step of msg.hint.steps) {
          const li = document.createElement("li");
          li.textContent = step;
          list.append(li);
        }
        hintBox.append(title, list);
      }
    } else if (msg.type === "error") {
      showError(msg.message);
    }
  });

  syncVisibility();
  syncDeployrc(${JSON.stringify(d.hasDeployrc)});
})();
</script>
</body>
</html>`;
}
