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
  /** Validated final value when the agent declares an output schema. */
  structuredOutput?: JsonValue;
  /** Host data set when the run started and never changed. */
  metadata?: Record<string, JsonValue>;
  /** The agent the run executes. */
  agentId?: string;
  /** The workflow a root run executes. */
  workflowId?: string;
  /** Set on a child run. */
  parentRunId?: string;
  /** Set on a child run. */
  rootRunId?: string;
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
