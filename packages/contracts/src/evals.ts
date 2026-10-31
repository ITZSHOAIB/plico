import type { RunStatus } from "./runs.js";

export interface EvalCaseResult {
  name: string;
  description?: string;
  status: "pass" | "fail";
  runId: string;
  runStatus: RunStatus;
  output?: string;
  diagnostics?: string[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}
