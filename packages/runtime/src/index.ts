import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type LoadedProject, type ValidationIssue, validateProject } from "@plico/core";

export type RunStatus = "completed" | "failed";

export type PlicoEventType =
  | "run.started"
  | "instructions.composed"
  | "assistant.output"
  | "run.completed"
  | "run.failed"
  | "run.error";

export interface PlicoEvent {
  schemaVersion: 1;
  runId: string;
  id: string;
  sequence: number;
  timestamp: string;
  type: PlicoEventType;
  payload: Record<string, unknown>;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}

export async function runProject(root: string): Promise<RunResult> {
  const validation = await validateProject(root);
  const runId = "run-0001";
  const events = new InMemoryEventLog(runId);

  if (!validation.ok || !validation.project) {
    events.append("run.error", {
      phase: "validation",
      issues: validation.errors,
    });
    events.append("run.failed", {
      phase: "validation",
      status: "failed",
    });

    return {
      runId,
      status: "failed",
      events: events.all(),
      errors: validation.errors,
    };
  }

  events.append("run.started", {
    projectRoot: validation.project.root,
    projectName: validation.project.config.name,
  });

  try {
    const instructions = await composeInstructions(validation.project);
    events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const output = `Dry run complete for ${validation.project.config.name}.`;
    events.append("assistant.output", { content: output });
    events.append("run.completed", { status: "completed" });

    return {
      runId,
      status: "completed",
      output,
      events: events.all(),
    };
  } catch (error) {
    events.append("run.error", {
      phase: "runtime",
      message: errorMessage(error),
    });
    events.append("run.failed", {
      phase: "runtime",
      status: "failed",
    });

    return {
      runId,
      status: "failed",
      events: events.all(),
    };
  }
}

export interface ComposedInstructions {
  sources: string[];
  content: string;
}

export async function composeInstructions(project: LoadedProject): Promise<ComposedInstructions> {
  const sources = ["agent.md"];
  const parts = [await readFile(join(project.root, "agent.md"), "utf8")];
  const skillNames = (await readdir(join(project.root, "skills")))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const skillName of skillNames) {
    const source = `skills/${skillName}`;
    sources.push(source);
    parts.push(await readFile(join(project.root, source), "utf8"));
  }

  return {
    sources,
    content: parts.map((part) => part.trimEnd()).join("\n\n"),
  };
}

class InMemoryEventLog {
  readonly #events: PlicoEvent[] = [];

  constructor(private readonly runId: string) {}

  append(type: PlicoEventType, payload: Record<string, unknown>): PlicoEvent {
    const sequence = this.#events.length + 1;
    const event: PlicoEvent = {
      schemaVersion: 1,
      runId: this.runId,
      id: `evt-${String(sequence).padStart(4, "0")}`,
      sequence,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };

    this.#events.push(event);
    return event;
  }

  all(): PlicoEvent[] {
    return [...this.#events];
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown runtime error";
}
