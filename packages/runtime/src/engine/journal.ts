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

/** A worker's hold on a running run. `until` is epoch milliseconds. */
export interface Lease {
  workerId: string;
  until: number;
}

/** The engine's private record of where each run resumes. It never says what happened; events do. */
export interface Journal {
  /** Creates the run, held by `lease`. Returns false when the id is already taken. */
  begin(runId: string, inputJson: string, lease: Lease): Promise<boolean>;
  getRun(runId: string): Promise<JournalRun | undefined>;
  setState(runId: string, state: ExecutionState): Promise<void>;
  /** Extends the lease if `lease.workerId` still holds the run. */
  renew(runId: string, lease: Lease): Promise<void>;
  /**
   * Makes `lease.workerId` the holder and sets the run running. With `expected`, it only does so
   * when that holder still has the run, so two recoverers cannot both win.
   */
  claim(runId: string, lease: Lease, expected?: Lease): Promise<boolean>;
  /** Running runs another worker held and lost: its lease ran out or its process is gone. */
  listStale(workerId: string, now: number): Promise<Array<{ runId: string; held: Lease }>>;
  getStep(runId: string, index: number): Promise<JournalStep | undefined>;
  /** Records a step once. A second write at the same index changes nothing. */
  putStep(runId: string, index: number, step: JournalStep): Promise<void>;
}
