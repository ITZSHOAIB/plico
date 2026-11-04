import type { EvalReport, PlicoEvent, RunSummary } from "@plico/contracts";

export interface EventStore {
  readonly storageIdentity?: string;
  appendEvent(event: PlicoEvent): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
  persistEvalReport(report: EvalReport): Promise<void>;
  getLatestEvalReport(): Promise<EvalReport | undefined>;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
  /** Open an existing database without changing it. Adds no files unless it has a pending WAL. */
  readOnly?: boolean;
}
