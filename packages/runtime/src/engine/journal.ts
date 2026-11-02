import type { ExecutionState } from "./types.js";

export interface JournalRun {
  runId: string;
  state: ExecutionState;
  inputJson: string;
}

export interface JournalStep {
  name: string;
  resultJson: string;
}

/** The engine's private record of where each run resumes. It never says what happened; events do. */
export interface Journal {
  /** Creates the run. Returns false when the id is already taken. */
  begin(runId: string, inputJson: string): Promise<boolean>;
  getRun(runId: string): Promise<JournalRun | undefined>;
  setState(runId: string, state: ExecutionState): Promise<void>;
  getStep(runId: string, index: number): Promise<JournalStep | undefined>;
  /** Records a step once. A second write at the same index changes nothing. */
  putStep(runId: string, index: number, step: JournalStep): Promise<void>;
}
