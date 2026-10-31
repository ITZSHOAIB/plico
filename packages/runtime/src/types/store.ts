import type { EvalReport, PlicoEvent, RunSummary } from "@plico/contracts";

export interface PersistedRun extends RunSummary {
  events: PlicoEvent[];
}

export interface EventStore {
  persistRun(run: PersistedRun): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
  persistEvalReport(report: EvalReport): Promise<void>;
  getLatestEvalReport(): Promise<EvalReport | undefined>;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
  /** Open an existing database without creating or changing anything. */
  readOnly?: boolean;
}
