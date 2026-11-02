import type { PlicoEvent } from "./events.js";
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
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}
