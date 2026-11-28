import type { JsonValue } from "@plico-ai/contracts";
import type { Metadata } from "../storage/metadata.js";
import type { DryRunScriptStep, RunProjectOptions } from "../types/index.js";
import type { StoredSpanContext } from "./tracing.js";

export interface RunInput {
  root: string;
  displayRoot?: string;
  startedAt: string;
  message?: string;
  threadId?: string;
  metadata?: Metadata;
  context?: Metadata;
  history?: RunProjectOptions["history"];
  script?: DryRunScriptStep[];
  mockTools?: boolean;
  providerRecoveryKey?: string;
  traceContext?: StoredSpanContext;
  /** Set on runs that journal their agent or workflow as their first step. */
  recordsTarget?: boolean;
  /** The selected agent. Absent when the run uses `entry` or `main`, and on older runs. */
  agent?: string;
  /** The selected workflow. */
  workflow?: string;
  /** A workflow's typed input. */
  input?: JsonValue;
}
