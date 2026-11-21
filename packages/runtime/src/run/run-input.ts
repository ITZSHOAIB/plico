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
}
