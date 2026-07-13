import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  registerProject,
  detectProjectType,
  loadProjectDeployrc,
  saveProjectDeployrc,
  store,
  RegisterInput,
} from "remotry-core";
import { ProjectsTreeDataProvider } from "../tree/treeDataProvider";

interface FormDefaults {
  name: string;
  localPath: string;
  remoteUser: string;
  remoteHost: string;
  remotePath: string;
  remotePort: number;
  buildCommand: string;
  buildPath: string;
  installCommand: string;
  projectType: string;
  framework: string;
  sshKey: string;
  detectedType: string;
  saveToWorkspace: boolean;
  isEdit: boolean;
}

export async function openRegisterForm(
  _context: vscode.ExtensionContext,
  treeDataProvider: ProjectsTreeDataProvider,
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

  const panel = vscode.window.createWebviewPanel(
    "deployRegister",
    defaults.isEdit ? `Edit: ${editName}` : "Register Deploy Project",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = renderHtml(defaults);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "submit") {
      await handleSubmit(msg.data, panel, treeDataProvider, defaults.isEdit);
    } else if (msg.type === "detect") {
      const newDefaults = redetect(msg.localPath, defaults);
      panel.webview.postMessage({ type: "prefill", data: newDefaults });
    } else if (msg.type === "pick-path") {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select project folder",
      });
      if (picked && picked[0]) {
        panel.webview.postMessage({ type: "set-path", path: picked[0].fsPath });
      }
    } else if (msg.type === "pick-key") {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        openLabel: "Select SSH private key",
      });
      if (picked && picked[0]) {
        panel.webview.postMessage({ type: "set-key", path: picked[0].fsPath });
      }
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
    remoteUser: opts.defaultUser,
    remoteHost: "",
    remotePath: opts.defaultBase,
    remotePort: 22,
    buildCommand: "pnpm build",
    buildPath: "./dist",
    installCommand: "",
    projectType: "node",
    framework: "",
    sshKey: opts.defaultSshKey,
    detectedType: "unknown",
    saveToWorkspace: false,
    isEdit: false,
  };

  if (opts.editName) {
    const existing = store.getProject(opts.editName);
    if (existing) {
      base.isEdit = true;
      base.name = existing.name;
      base.localPath = existing.localPath;
      base.remoteUser = existing.remoteUser;
      base.remoteHost = existing.remoteHost;
      base.remotePath = existing.remotePath;
      base.remotePort = existing.remotePort;
      base.buildCommand = existing.buildCommand;
      base.buildPath = existing.buildPath;
      base.installCommand = existing.installCommand ?? "";
      base.projectType = existing.projectType;
      base.framework = existing.framework ?? "";
      base.sshKey = existing.sshKey ?? opts.defaultSshKey;
      base.detectedType = existing.framework ? `${existing.projectType}/${existing.framework}` : existing.projectType;
    }
  } else if (opts.workspaceFolder) {
    const rc = loadProjectDeployrc(opts.workspaceFolder);
    const detected = detectProjectType(opts.workspaceFolder);
    base.name = path.basename(opts.workspaceFolder);
    base.detectedType = detected ? `${detected.type}${detected.framework ? "/" + detected.framework : ""}` : "unknown";

    if (rc) {
      base.name = rc.name ?? base.name;
      base.localPath = rc.localPath ?? base.localPath;
      base.remoteHost = rc.remoteHost ?? base.remoteHost;
      base.remoteUser = rc.remoteUser ?? base.remoteUser;
      base.remotePath = rc.remotePath ?? base.remotePath;
      base.remotePort = rc.remotePort ?? base.remotePort;
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

function redetect(localPath: string, _base: FormDefaults): Partial<FormDefaults> {
  if (!localPath || !fs.existsSync(localPath)) return {};
  const rc = loadProjectDeployrc(localPath);
  const detected = detectProjectType(localPath);
  const result: Partial<FormDefaults> = {
    detectedType: detected ? `${detected.type}${detected.framework ? "/" + detected.framework : ""}` : "unknown",
    name: rc?.name ?? path.basename(localPath),
  };
  if (rc) {
    if (rc.buildCommand) result.buildCommand = rc.buildCommand;
    if (rc.buildPath) result.buildPath = rc.buildPath;
    if (rc.installCommand) result.installCommand = rc.installCommand;
    if (rc.projectType) result.projectType = rc.projectType;
    if (rc.framework) result.framework = rc.framework;
    if (rc.remoteHost) result.remoteHost = rc.remoteHost;
    if (rc.remoteUser) result.remoteUser = rc.remoteUser;
    if (rc.remotePath) result.remotePath = rc.remotePath;
    if (rc.remotePort) result.remotePort = rc.remotePort;
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

async function handleSubmit(
  data: Record<string, string | boolean | number>,
  panel: vscode.WebviewPanel,
  treeDataProvider: ProjectsTreeDataProvider,
  isEdit: boolean
) {
  const input: RegisterInput = {
    name: String(data.name).trim(),
    localPath: String(data.localPath).trim(),
    remote: `${String(data.remoteUser).trim()}@${String(data.remoteHost).trim()}:${String(data.remotePath).trim()}`,
    buildCommand: String(data.buildCommand).trim() || undefined,
    buildPath: String(data.buildPath).trim() || undefined,
    installCommand: String(data.installCommand).trim() || undefined,
    projectType: String(data.projectType).trim() || undefined,
    framework: String(data.framework).trim() || undefined,
    sshKey: String(data.sshKey).trim() || undefined,
    remotePort: Number(data.remotePort) || 22,
    update: isEdit,
  };

  try {
    const project = registerProject(input);

    if (data.saveToWorkspace) {
      saveProjectDeployrc(input.localPath, {
        name: project.name,
        localPath: project.localPath,
        remoteHost: project.remoteHost,
        remotePort: project.remotePort,
        remoteUser: project.remoteUser,
        remotePath: project.remotePath,
        buildCommand: project.buildCommand,
        buildPath: project.buildPath,
        installCommand: project.installCommand,
        projectType: project.projectType,
        framework: project.framework,
        sshKey: project.sshKey,
      });
    }

    treeDataProvider.refresh();
    vscode.window.showInformationMessage(`Project "${project.name}" ${isEdit ? "updated" : "registered"}.`);
    panel.dispose();
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
  .row.full { grid-template-columns: 1fr; }
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
  input:focus, select:focus {
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
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.small { padding: 4px 10px; font-size: 0.85em; }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
  }
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .checkbox-row input { width: auto; }
  .error {
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    padding: 8px 12px;
    border-radius: 3px;
    margin-bottom: 14px;
    display: none;
  }
  .error.visible { display: block; }
  .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .remote-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 80px;
    gap: 8px;
  }
  .remote-grid label { font-size: 0.8em; color: var(--vscode-descriptionForeground); display: block; margin-bottom: 4px; }
  .remote-path-row {
    margin-top: 8px;
  }
</style>
</head>
<body>
  <div class="title-row">
    <h1>${title}</h1>
    <span class="detected-pill" id="detectedPill">${escapeHtml(d.detectedType)}</span>
  </div>
  <div class="subtitle">${d.isEdit ? "Update project configuration." : "Register a new deploy target. Fields prefilled from <code>.deployrc</code> or detected project type."}</div>

  <div class="error" id="errorBox"></div>

  <form id="form">
    <fieldset>
      <legend>Project</legend>
      <div class="row">
        <label>Name</label>
        <input id="name" type="text" value="${escapeHtml(d.name)}" required ${d.isEdit ? "readonly" : ""} placeholder="my-app" />
      </div>
      <div class="row">
        <label>Local path</label>
        <div class="inline">
          <input id="localPath" type="text" value="${escapeHtml(d.localPath)}" required placeholder="/path/to/project" />
          <button type="button" class="secondary small" id="pickPath">Browse</button>
        </div>
      </div>
      <div class="row">
        <label>Type</label>
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
        <label>Framework</label>
        <input id="framework" type="text" value="${escapeHtml(d.framework)}" placeholder="next, vite, angular... (optional)" />
      </div>
    </fieldset>

    <fieldset>
      <legend>Build</legend>
      <div class="row">
        <label>Install cmd</label>
        <input id="installCommand" type="text" value="${escapeHtml(d.installCommand)}" placeholder="pnpm install (optional, skipped if empty)" />
      </div>
      <div class="row">
        <label>Build cmd</label>
        <input id="buildCommand" type="text" value="${escapeHtml(d.buildCommand)}" required placeholder="pnpm build" />
      </div>
      <div class="row">
        <label>Build output</label>
        <input id="buildPath" type="text" value="${escapeHtml(d.buildPath)}" required placeholder="./dist" />
      </div>
    </fieldset>

    <fieldset>
      <legend>Remote</legend>
      <div class="remote-grid">
        <div>
          <label>User</label>
          <input id="remoteUser" type="text" value="${escapeHtml(d.remoteUser)}" required placeholder="root" />
        </div>
        <div>
          <label>Host</label>
          <input id="remoteHost" type="text" value="${escapeHtml(d.remoteHost)}" required placeholder="example.com or 1.2.3.4" />
        </div>
        <div>
          <label>Port</label>
          <input id="remotePort" type="number" value="${d.remotePort}" min="1" max="65535" />
        </div>
      </div>
      <div class="row remote-path-row">
        <label>Remote path</label>
        <input id="remotePath" type="text" value="${escapeHtml(d.remotePath)}" required placeholder="/var/www/my-app" />
      </div>
      <div class="row">
        <label>SSH key</label>
        <div class="inline">
          <input id="sshKey" type="text" value="${escapeHtml(d.sshKey)}" placeholder="${escapeHtml(path.join(home, ".ssh", "id_rsa"))}" />
          <button type="button" class="secondary small" id="pickKey">Browse</button>
        </div>
      </div>
      <div class="hint">Tilde (<code>~</code>) is expanded to your home directory.</div>
    </fieldset>

    <fieldset>
      <legend>Options</legend>
      <div class="checkbox-row">
        <input id="saveToWorkspace" type="checkbox" />
        <label for="saveToWorkspace">Also save <code>.deployrc</code> in workspace (commit-friendly)</label>
      </div>
    </fieldset>

    <div class="actions">
      <button type="button" class="secondary" id="cancel">Cancel</button>
      <button type="submit" id="submit">${d.isEdit ? "Update" : "Register"}</button>
    </div>
  </form>

<script>
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const fields = ["name","localPath","projectType","framework","installCommand","buildCommand","buildPath","remoteUser","remoteHost","remotePort","remotePath","sshKey","saveToWorkspace"];

  $("projectType").value = ${JSON.stringify(d.projectType)};

  $("pickPath").addEventListener("click", () => vscode.postMessage({ type: "pick-path" }));
  $("pickKey").addEventListener("click", () => vscode.postMessage({ type: "pick-key" }));
  $("cancel").addEventListener("click", () => vscode.postMessage({ type: "cancel" }));

  // Re-detect when localPath changes (debounced)
  let detectTimer;
  $("localPath").addEventListener("input", (e) => {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(() => vscode.postMessage({ type: "detect", localPath: e.target.value }), 400);
  });

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {};
    for (const f of fields) {
      const el = $(f);
      data[f] = el.type === "checkbox" ? el.checked : el.value;
    }
    vscode.postMessage({ type: "submit", data });
  });

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "prefill") {
      const d = msg.data;
      if (d.detectedType !== undefined) $("detectedPill").textContent = d.detectedType;
      for (const f of fields) {
        if (d[f] !== undefined) {
          const el = $(f);
          if (el && el.type !== "checkbox") el.value = d[f];
        }
      }
    } else if (msg.type === "set-path") {
      $("localPath").value = msg.path;
      $("localPath").dispatchEvent(new Event("input"));
    } else if (msg.type === "set-key") {
      $("sshKey").value = msg.path;
    } else if (msg.type === "error") {
      const box = $("errorBox");
      box.textContent = msg.message;
      box.classList.add("visible");
      box.scrollIntoView({ behavior: "smooth" });
    }
  });
})();
</script>
</body>
</html>`;
}
