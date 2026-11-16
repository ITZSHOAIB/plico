import type { JsonValue, PlicoEvent } from "./events.js";
import type { ValidationIssue } from "./project.js";

export type RunStatus = "running" | "completed" | "failed" | "waiting" | "cancelled";

export interface RunSummary {
  runId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  output?: string;
  /** Host data set when the run started and never changed. */
  metadata?: Record<string, JsonValue>;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  /** Validated final value when the agent declares an output schema. */
  structuredOutput?: JsonValue;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}
