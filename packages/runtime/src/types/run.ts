import type { JsonValue } from "@plico/contracts";
import type { Engine } from "../engine/index.js";
import type { ModelProvider, ProviderMessage } from "./provider.js";
import type { DryRunScriptStep } from "./script.js";
import type { EventStore } from "./store.js";

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
  /**
   * Do not run tool handlers for scripted `tool.call` steps. Each step supplies its output as
   * `result`; a step without one fails the run, and `live: true` opts a step back in to its handler.
   */
  mockTools?: boolean;
  eventStore?: EventStore;
  /** Runs the loop durably. Defaults to an in-memory engine that does not survive the process. */
  engine?: Engine;
  runId?: string;
  provider?: ModelProvider;
  /** Opaque identity used to prevent recovery with a different provider configuration. */
  providerRecoveryKey?: string;
  message?: string;
  threadId?: string;
  /** Host data stamped on `run.started`. Immutable and returned by run reads and filters. */
  metadata?: Record<string, JsonValue>;
  /** Host data passed to tools as `ctx.context` and recorded on `run.started`. No secrets. */
  context?: Record<string, JsonValue>;
  history?: Array<Pick<ProviderMessage, "role" | "content">>;
  onStarted?: (runId: string) => void;
}
