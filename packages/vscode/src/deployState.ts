import * as vscode from "vscode";
import { DeployEvent } from "@develoverli/remotry-core";

/** Lines of recent deploy output kept per project for the sidebar card. */
const LOG_TAIL = 3;

export type RunPhase = "running" | "success" | "failed";

export interface DeployRun {
  phase: RunPhase;
  step?: string;
  stepIndex?: number;
  stepTotal?: number;
  filesDone?: number;
  filesTotal?: number;
  /** "bytes" while uploading a compressed archive. */
  progressUnit?: "files" | "bytes";
  log: string[];
  error?: string;
  durationMs?: number;
  files?: number;
}

/**
 * In-memory deploy progress for this VSCode session, shared by the sidebar panel,
 * the status bar, and the commands. Persistent results live in the project registry.
 */
export class DeployState implements vscode.Disposable {
  private readonly runs = new Map<string, DeployRun>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  get(name: string): DeployRun | undefined {
    return this.runs.get(name);
  }

  isDeploying(name: string): boolean {
    return this.runs.get(name)?.phase === "running";
  }

  /** Signal that the project registry changed (register, edit, remove, rollback). */
  changed(): void {
    this.emitter.fire();
  }

  start(name: string): void {
    this.runs.set(name, { phase: "running", log: [] });
    this.emitter.fire();
  }

  apply(name: string, event: DeployEvent): void {
    const run = this.runs.get(name);
    if (!run) return;
    switch (event.type) {
      case "step":
        run.step = event.message;
        run.stepIndex = event.current;
        run.stepTotal = event.total;
        run.filesDone = undefined;
        run.filesTotal = undefined;
        run.progressUnit = undefined;
        this.pushLog(run, event.message);
        break;
      case "progress":
        run.filesDone = event.current;
        run.filesTotal = event.total;
        run.progressUnit = event.unit ?? "files";
        break;
      case "info":
      case "success":
        this.pushLog(run, event.message);
        break;
      case "warn":
        this.pushLog(run, `Warning: ${event.message}`);
        break;
      case "error":
        this.pushLog(run, `Error: ${event.message}`);
        break;
      case "done":
        run.durationMs = event.durationMs;
        run.files = event.filesUploaded;
        break;
    }
    this.emitter.fire();
  }

  succeed(name: string): void {
    const run = this.runs.get(name);
    if (run) run.phase = "success";
    this.emitter.fire();
  }

  fail(name: string, error: string): void {
    const run = this.runs.get(name) ?? { phase: "failed", log: [] };
    run.phase = "failed";
    run.error = error;
    this.runs.set(name, run);
    this.emitter.fire();
  }

  /** Drop the session run (e.g. cancelled before anything happened). */
  clear(name: string): void {
    this.runs.delete(name);
    this.emitter.fire();
  }

  private pushLog(run: DeployRun, line: string): void {
    run.log.push(line);
    if (run.log.length > LOG_TAIL) run.log.splice(0, run.log.length - LOG_TAIL);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
