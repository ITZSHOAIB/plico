import type { PlicoEvent } from "./events.js";
import type { ValidationIssue } from "./project.js";

export type RunStatus = "completed" | "failed" | "blocked";

export interface RunSummary {
  runId: string;
  projectRoot: string;
  projectName: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  output?: string;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  events: PlicoEvent[];
  errors?: ValidationIssue[];
}
