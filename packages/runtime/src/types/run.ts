import type { ModelProvider } from "./provider.js";
import type { DryRunScriptStep } from "./script.js";
import type { EventStore } from "./store.js";

export interface RunProjectOptions {
  script?: DryRunScriptStep[];
  eventStore?: EventStore;
  runId?: string;
  provider?: ModelProvider;
  message?: string;
}
