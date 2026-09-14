import * as vscode from "vscode";
import { randomBytes } from "crypto";
import {
  listProjects,
  relativeTime,
  describeTarget,
  authMethodOf,
  targetTypeOf,
  store,
  ProjectConfig,
  ErrorHint,
  HintAction,
} from "@develoverli/remotry-core";
import { DeployRun, DeployState } from "../deployState";
import { isWorkspaceProject } from "../workspace";
import { HINT_ACTION_LABELS, hintFor, runHintAction } from "../hints";

export const PROJECTS_VIEW_ID = "deployProjects";

// Progress events can arrive hundreds of times per second; batch webview updates.
const POST_THROTTLE_MS = 120;
// Keep "5m ago" labels fresh while the panel is visible.
const RELATIVE_TIME_REFRESH_MS = 30_000;

/** Commands the webview is allowed to trigger, with a project name argument. */
const ALLOWED_COMMANDS = new Set([
  "deploy.deploy",
  "deploy.rollback",
  "deploy.testConnection",
  "deploy.register",
  "deploy.status",
  "deploy.remove",
  "deploy.showLog",
]);

const AUTH_LABELS = { key: "SSH key", password: "Password", agent: "ssh-agent" } as const;

type CardStatus = "running" | "failed" | "success" | "never";

interface CardData {
  name: string;
  kind: string;
  target: string;
  login: string;
  localPath: string;
  isWorkspace: boolean;
  status: CardStatus;
  lastDeploy?: string;
  error?: string;
  hint?: ErrorHint & { labels: Partial<Record<HintAction, string>> };
  run?: DeployRun;
}

function cardFor(project: ProjectConfig, run: DeployRun | undefined): CardData {
  let status: CardStatus;
  if (run?.phase === "running") status = "running";
  else if (run?.phase === "failed" || (!run && project.lastDeployStatus === "failed")) status = "failed";
  else if (project.lastDeploy) status = "success";
  else status = "never";

  const error = status === "failed" ? run?.error ?? project.lastDeployError : undefined;
  const hint = error ? hintFor(project, error) : undefined;

  return {
    name: project.name,
    kind: project.framework ?? project.projectType,
    target: describeTarget(project),
    login: targetTypeOf(project) === "folder" ? "Folder" : AUTH_LABELS[authMethodOf(project)],
    localPath: project.localPath,
    isWorkspace: isWorkspaceProject(project),
    status,
    lastDeploy: project.lastDeploy ? relativeTime(project.lastDeploy) : undefined,
    error,
    hint: hint && { ...hint, labels: Object.fromEntries(hint.actions.map((a) => [a, HINT_ACTION_LABELS[a]])) },
    run,
  };
}

/** Sidebar panel: one card per project with status, live progress, and actions. */
export class ProjectsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private postTimer: NodeJS.Timeout | undefined;
  private clockTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: DeployState
  ) {
    this.subscriptions = [
      state.onDidChange(() => this.schedulePost()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedulePost()),
    ];
  }

  get visible(): boolean {
    return !!this.view?.visible;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const codiconsRoot = vscode.Uri.joinPath(this.extensionUri, "out", "codicons");
    view.webview.options = { enableScripts: true, localResourceRoots: [codiconsRoot] };
    view.webview.html = this.renderHtml(view.webview, codiconsRoot);

    view.webview.onDidReceiveMessage((msg: { type?: string; command?: string; name?: string }) => {
      if (msg.type === "ready") {
        this.post();
      } else if (msg.type === "run" && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
        void vscode.commands.executeCommand(msg.command, msg.name);
      } else if (msg.type === "hint-action" && msg.name && msg.command && Object.prototype.hasOwnProperty.call(HINT_ACTION_LABELS, msg.command)) {
        void runHintAction(msg.command as HintAction, msg.name);
      } else if (msg.type === "reveal" && msg.name) {
        const project = store.getProject(msg.name);
        if (project) void vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(project.localPath));
      }
    });

    view.onDidChangeVisibility(() => {
      if (view.visible) this.post();
      this.syncClock();
    });
    view.onDidDispose(() => {
      this.view = undefined;
      this.syncClock();
    });
    this.syncClock();
  }

  /** Reveal the panel, e.g. when a deploy starts from the status bar. */
  reveal(): void {
    this.view?.show?.(true);
  }

  private syncClock(): void {
    if (this.view?.visible && !this.clockTimer) {
      this.clockTimer = setInterval(() => this.post(), RELATIVE_TIME_REFRESH_MS);
    } else if (!this.view?.visible && this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = undefined;
    }
  }

  private schedulePost(): void {
    if (this.postTimer) return;
    this.postTimer = setTimeout(() => {
      this.postTimer = undefined;
      this.post();
    }, POST_THROTTLE_MS);
  }

  private post(): void {
    if (!this.view) return;
    const cards = Object.values(listProjects())
      .map((p) => cardFor(p, this.state.get(p.name)))
      .sort((a, b) => Number(b.isWorkspace) - Number(a.isWorkspace) || a.name.localeCompare(b.name));
    void this.view.webview.postMessage({ type: "state", cards });
  }

  private renderHtml(webview: vscode.Webview, codiconsRoot: vscode.Uri): string {
    const nonce = randomBytes(16).toString("base64");
    const codiconsCss = webview.asWebviewUri(vscode.Uri.joinPath(codiconsRoot, "codicon.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${codiconsCss}">
<title>Deploy Projects</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 8px 12px 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 10px;
    padding: 5px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font: inherit;
  }
  .list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .card {
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.35)));
    border-radius: 6px;
    padding: 10px 12px 12px;
    background: var(--vscode-sideBar-background, transparent);
  }
  .card.is-workspace { border-color: var(--vscode-focusBorder); }
  .card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .card-title {
    margin: 0;
    font-size: 1.05em;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .badge .codicon { font-size: 14px; }
  .badge.success .codicon { color: var(--vscode-testing-iconPassed, #73c991); }
  .badge.failed { color: var(--vscode-errorForeground); }
  .badge.running .codicon { color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); }
  .tag {
    display: inline-block;
    margin-top: 6px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 0.8em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .meta {
    margin: 4px 0 0;
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail { margin: 10px 0 0; font-size: 0.9em; }
  .muted { color: var(--vscode-descriptionForeground); }
  .progress {
    height: 4px;
    margin: 6px 0;
    border-radius: 2px;
    background: var(--vscode-editorWidget-border, rgba(128,128,128,.3));
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: var(--vscode-progressBar-background, var(--vscode-focusBorder));
    transition: width 200ms cubic-bezier(0.25, 1, 0.5, 1);
  }
  .progress.indeterminate .progress-bar { width: 30%; animation: slide 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  .log {
    margin: 6px 0 0;
    padding: 6px 8px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    line-height: 1.45;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.12));
    white-space: pre-wrap;
    word-break: break-word;
  }
  .error {
    margin: 10px 0 0;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    background: var(--vscode-inputValidation-errorBackground, transparent);
    font-size: 0.9em;
  }
  .error-text {
    word-break: break-word;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .hint {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.35));
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.1));
    font-size: 0.9em;
    line-height: 1.45;
  }
  .hint-title { display: flex; gap: 6px; font-weight: 600; }
  .hint-title .codicon { color: var(--vscode-editorLightBulb-foreground, #ddb100); flex-shrink: 0; margin-top: 1px; }
  .hint ol { margin: 6px 0 0; padding-left: 20px; }
  .hint li + li { margin-top: 2px; }
  .actions { display: flex; align-items: center; gap: 4px; margin-top: 12px; position: relative; }
  button {
    font: inherit;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 2px;
    cursor: pointer;
  }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button:disabled { cursor: default; opacity: 0.6; }
  .primary {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 28px;
    padding: 4px 10px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .primary:not(:disabled):hover { background: var(--vscode-button-hoverBackground); }
  .secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
  }
  .icon:not(:disabled):hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 10;
    min-width: 170px;
    padding: 4px 0;
    border-radius: 4px;
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, rgba(128,128,128,.35)));
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,.36));
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }
  .menu button:hover, .menu button:focus-visible {
    outline: none;
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
    color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
  }
  .menu .danger { color: var(--vscode-errorForeground); }
  .menu hr { border: 0; border-top: 1px solid var(--vscode-menu-separatorBackground, rgba(128,128,128,.35)); margin: 4px 0; }
  .empty { padding: 16px 4px; text-align: center; }
  .empty h2 { font-size: 1.05em; margin: 8px 0 6px; }
  .empty p { margin: 0 0 14px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  .empty > .codicon { font-size: 28px; color: var(--vscode-descriptionForeground); }
  .empty .primary { width: 100%; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) {
    .progress-bar { transition: none; }
    .progress.indeterminate .progress-bar { animation: none; width: 100%; opacity: 0.5; }
    .codicon-modifier-spin { animation: none; }
  }
</style>
</head>
<body>
  <label class="sr-only" for="search">Filter projects</label>
  <input id="search" class="search" type="search" placeholder="Filter projects" hidden />
  <div id="root"></div>
  <div id="announcer" class="sr-only" role="status" aria-live="polite"></div>
<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");
  const search = document.getElementById("search");
  const SEARCH_THRESHOLD = 5;
  const announcer = document.getElementById("announcer");
  const STATUS_WORDS = { running: "deploying", failed: "deploy failed", success: "deployed", never: "not deployed" };
  let cards = [];
  let openMenu = null;
  let renderPending = false;
  const lastStatus = new Map();

  const run = (command, name) => vscode.postMessage({ type: "run", command, name });
  const HINT_ICONS = { openDeveloperSettings: "settings-gear", testConnection: "plug", editProject: "edit", rollback: "history" };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  const icon = (name, extra = "") => el("span", { class: "codicon codicon-" + name + (extra ? " " + extra : ""), "aria-hidden": "true" });

  function iconButton(name, label, onclick, props = {}) {
    return el("button", { class: "icon", title: label, "aria-label": label, onclick, ...props }, icon(name));
  }

  function badge(card) {
    const map = {
      running: ["sync", "Deploying", "codicon-modifier-spin"],
      failed: ["error", "Failed"],
      success: ["pass-filled", card.lastDeploy ? "Deployed " + card.lastDeploy : "Deployed"],
      never: ["circle-large-outline", "Not deployed yet"],
    };
    const [name, label, extra] = map[card.status];
    return el("span", { class: "badge " + card.status }, [icon(name, extra), el("span", { text: label })]);
  }

  function runningDetail(card) {
    const r = card.run || { log: [] };
    const hasFiles = r.filesTotal > 0;
    const pct = hasFiles ? Math.round((r.filesDone / r.filesTotal) * 100) : 0;
    const stepText = r.stepIndex ? "Step " + r.stepIndex + " of " + r.stepTotal + ": " + (r.step || "") : "Starting...";
    return el("div", { class: "detail" }, [
      el("div", { text: stepText }),
      el("div", {
        class: "progress" + (hasFiles ? "" : " indeterminate"),
        role: "progressbar",
        "aria-label": "Deploy progress",
        "aria-valuemin": hasFiles ? "0" : undefined,
        "aria-valuemax": hasFiles ? "100" : undefined,
        "aria-valuenow": hasFiles ? String(pct) : undefined,
      }, el("div", { class: "progress-bar", style: hasFiles ? "width:" + pct + "%" : undefined })),
      hasFiles
        ? el("div", {
            class: "muted",
            text: r.progressUnit === "bytes"
              ? (r.filesDone / 1048576).toFixed(1) + " of " + (r.filesTotal / 1048576).toFixed(1) + " MB uploaded"
              : r.filesDone + " of " + r.filesTotal + " files",
          })
        : null,
      r.log.length ? el("pre", { class: "log", text: r.log.join("\\n") }) : null,
    ]);
  }

  function statusDetail(card) {
    if (card.status === "running") return runningDetail(card);
    if (card.status === "failed") {
      const hint = card.hint;
      const hintButtons = hint
        ? hint.actions
            .filter((a) => a !== "showLog")
            .map((a) =>
              el("button", { class: "secondary", onclick: () => vscode.postMessage({ type: "hint-action", command: a, name: card.name }) }, [
                icon(HINT_ICONS[a] || "arrow-right"),
                el("span", { text: hint.labels[a] }),
              ])
            )
        : [];
      return el("div", {}, [
        el("div", { class: "error", role: "alert", title: card.error }, el("div", { class: "error-text", text: card.error || "The last deploy failed." })),
        hint
          ? el("div", { class: "hint" }, [
              el("div", { class: "hint-title" }, [icon("lightbulb"), el("span", { text: hint.title })]),
              el("ol", {}, hint.steps.map((step) => el("li", { text: step }))),
            ])
          : null,
        el("div", { class: "row" }, [
          ...hintButtons,
          el("button", { class: "secondary", onclick: () => run("deploy.showLog") }, [icon("output"), el("span", { text: "Show log" })]),
          el("button", { class: "secondary", onclick: () => run("deploy.deploy", card.name) }, [icon("debug-restart"), el("span", { text: "Retry" })]),
        ]),
      ]);
    }
    if (card.status === "success" && card.run && card.run.phase === "success") {
      const parts = [];
      if (card.run.files !== undefined) parts.push(card.run.files + " files");
      if (card.run.durationMs !== undefined) parts.push((card.run.durationMs / 1000).toFixed(1) + "s");
      return parts.length ? el("p", { class: "detail muted", text: "Last run: " + parts.join(" · ") }) : null;
    }
    return null;
  }

  function closeMenu() {
    if (!openMenu) return;
    const { menu, trigger } = openMenu;
    menu.remove();
    trigger.setAttribute("aria-expanded", "false");
    openMenu = null;
    if (renderPending) {
      renderPending = false;
      render();
    }
  }

  function toggleMenu(card, trigger) {
    if (openMenu && openMenu.trigger === trigger) { closeMenu(); trigger.focus(); return; }
    closeMenu();
    const item = (name, label, onclick, cls) =>
      el("button", { role: "menuitem", class: cls, onclick: () => { closeMenu(); onclick(); } }, [icon(name), el("span", { text: label })]);
    const menu = el("div", { class: "menu", role: "menu", "aria-label": "More actions for " + card.name }, [
      item("info", "Show status", () => run("deploy.status", card.name)),
      item("folder-opened", "Reveal local folder", () => vscode.postMessage({ type: "reveal", name: card.name })),
      el("hr", { role: "separator" }),
      item("trash", "Remove project...", () => run("deploy.remove", card.name), "danger"),
    ]);
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); closeMenu(); trigger.focus(); }
    });
    trigger.parentElement.append(menu);
    trigger.setAttribute("aria-expanded", "true");
    openMenu = { menu, trigger, name: card.name };
    menu.querySelector('[role="menuitem"]').focus();
  }

  function renderCard(card) {
    const running = card.status === "running";
    const titleId = "title-" + card.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const more = iconButton("ellipsis", "More actions", (e) => toggleMenu(card, e.currentTarget), {
      "aria-haspopup": "menu", "aria-expanded": "false", "data-focus": card.name + ":more",
    });
    return el("li", {}, el("article", { class: "card" + (card.isWorkspace ? " is-workspace" : ""), "aria-labelledby": titleId }, [
      el("div", { class: "card-head" }, [
        el("h2", { class: "card-title", id: titleId, text: card.name, title: card.name }),
        badge(card),
      ]),
      card.isWorkspace ? el("span", { class: "tag", text: "This workspace" }) : null,
      el("p", { class: "meta", title: card.target, text: card.kind + " · " + card.login }),
      el("p", { class: "meta", title: card.target, text: card.target }),
      statusDetail(card),
      el("div", { class: "actions" }, [
        el("button", {
          class: "primary",
          disabled: running,
          "data-focus": card.name + ":deploy",
          onclick: () => run("deploy.deploy", card.name),
        }, [icon(running ? "sync" : "cloud-upload", running ? "codicon-modifier-spin" : ""), el("span", { text: running ? "Deploying..." : "Deploy" })]),
        iconButton("history", "Roll back", () => run("deploy.rollback", card.name), { disabled: running, "data-focus": card.name + ":rollback" }),
        iconButton("plug", "Test connection", () => run("deploy.testConnection", card.name), { "data-focus": card.name + ":test" }),
        iconButton("edit", "Edit project", () => run("deploy.register", card.name), { "data-focus": card.name + ":edit" }),
        more,
      ]),
    ]));
  }

  function renderEmpty() {
    return el("div", { class: "empty" }, [
      icon("cloud-upload"),
      el("h2", { text: "Deploy your first project" }),
      el("p", { text: "Register a project to build it and ship it to an SSH server or a network folder in one click." }),
      el("button", { class: "primary", onclick: () => run("deploy.register") }, [icon("add"), el("span", { text: "Register a project" })]),
    ]);
  }

  function render() {
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : undefined;

    search.hidden = cards.length <= SEARCH_THRESHOLD;
    const query = search.hidden ? "" : search.value.trim().toLowerCase();
    const visible = query ? cards.filter((c) => (c.name + " " + c.target).toLowerCase().includes(query)) : cards;

    root.replaceChildren(
      cards.length === 0
        ? renderEmpty()
        : visible.length === 0
          ? el("p", { class: "muted", text: "No projects match your filter." })
          : el("ul", { class: "list", "aria-label": "Deploy projects" }, visible.map(renderCard))
    );

    if (focusKey) {
      const target = root.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  function announceChanges() {
    const messages = [];
    for (const card of cards) {
      const previous = lastStatus.get(card.name);
      if (previous !== undefined && previous !== card.status) messages.push(card.name + " " + STATUS_WORDS[card.status]);
      lastStatus.set(card.name, card.status);
    }
    if (messages.length) announcer.textContent = messages.join(". ");
  }

  search.addEventListener("input", render);
  document.addEventListener("click", (e) => {
    if (openMenu && !openMenu.menu.contains(e.target) && e.target !== openMenu.trigger && !openMenu.trigger.contains(e.target)) closeMenu();
  });
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "state") {
      cards = e.data.cards;
      announceChanges();
      // Never rebuild the list under an open menu; it would steal focus on every progress tick.
      if (openMenu) renderPending = true;
      else render();
    }
  });
  vscode.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
  }

  dispose(): void {
    if (this.postTimer) clearTimeout(this.postTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.subscriptions.forEach((s) => s.dispose());
  }
}
