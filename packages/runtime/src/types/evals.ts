import type { RunStatus } from "@plico/contracts";
import type { DryRunScriptStep } from "./script.js";
import type { EventStore } from "./store.js";

export interface EvalExpectation {
  status?: RunStatus;
  outputContains?: string;
}

export interface EvalCase {
  name: string;
  description?: string;
  script: DryRunScriptStep[];
  expect?: EvalExpectation;
}

export interface RunEvalsOptions {
  eventStore?: EventStore;
}
