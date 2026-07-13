import { store } from "../store";
import { deployProject } from "./deploy";
import { DeployAllEvent } from "../events";

export interface DeployAllOptions {
  filter?: string;
  sequential?: boolean;
}

export async function* deployAll(options: DeployAllOptions = {}): AsyncGenerator<DeployAllEvent, void, unknown> {
  const projects = store.listProjects();
  const allNames = Object.keys(projects);

  if (allNames.length === 0) {
    throw new Error("No projects registered.");
  }

  const names = options.filter
    ? allNames.filter((n) => n.includes(options.filter!))
    : allNames;

  if (names.length === 0) {
    throw new Error(`No projects matching "${options.filter}"`);
  }

  yield { type: "start", names };

  let succeeded = 0;
  let failed = 0;

  if (options.sequential) {
    for (const name of names) {
      yield { type: "project-start", name };
      try {
        for await (const event of deployProject(name)) {
          yield { type: "project-event", name, event };
        }
        succeeded++;
        yield { type: "project-done", name, success: true };
      } catch (err) {
        failed++;
        yield {
          type: "project-done",
          name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }
  } else {
    // Parallel
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const events: { name: string; event: import("../events").DeployEvent }[] = [];
        try {
          for await (const event of deployProject(name)) {
            events.push({ name, event });
          }
          return { name, success: true, events };
        } catch (err) {
          return {
            name,
            success: false,
            events,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const { name, events, success } = r.value;
      yield { type: "project-start", name };
      for (const e of events) {
        yield { type: "project-event", name: e.name, event: e.event };
      }
      if (success) succeeded++;
      else failed++;
      yield {
        type: "project-done",
        name,
        success,
        error: !success && "error" in r.value ? r.value.error : undefined,
      };
    }
  }

  yield { type: "summary", succeeded, failed };
}
