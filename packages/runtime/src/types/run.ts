import type { Engine } from "../engine/index.js";
import type { ModelProvider } from "./provider.js";
import type { DryRunScriptStep } from "./script.js";
import type { EventStore } from "./store.js";

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
  eventStore?: EventStore;
  /** Runs the loop durably. Defaults to an in-memory engine that does not survive the process. */
  engine?: Engine;
  runId?: string;
  provider?: ModelProvider;
  /** Opaque identity used to prevent recovery with a different provider configuration. */
  providerRecoveryKey?: string;
  message?: string;
  onStarted?: (runId: string) => void;
}
