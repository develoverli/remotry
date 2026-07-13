export type DeployEvent =
  | { type: "step"; message: string; current: number; total: number }
  | { type: "info"; message: string }
  | { type: "warn"; message: string }
  | { type: "progress"; current: number; total: number; file: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; durationMs: number; filesUploaded?: number };

export type DeployAllEvent =
  | { type: "start"; names: string[] }
  | { type: "project-start"; name: string }
  | { type: "project-event"; name: string; event: DeployEvent }
  | { type: "project-done"; name: string; success: boolean; error?: string }
  | { type: "summary"; succeeded: number; failed: number };
