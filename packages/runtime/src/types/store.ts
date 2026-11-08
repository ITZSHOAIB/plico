import type { EvalReport, JsonValue, PlicoEvent, RunSummary } from "@plico/contracts";

export interface EventStore {
  readonly storageIdentity?: string;
  appendEvent(event: PlicoEvent): Promise<void>;
  /** Lists runs, newest first. `metadata` keeps runs whose top-level keys equal every given value. */
  listRuns(filter?: { metadata?: Record<string, JsonValue> }): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
  /** Returns run events in a thread, ordered by their durable insertion order. */
  getThreadRunEvents?(threadId: string): Promise<PlicoEvent[]>;
  /** Returns thread run events through the selected run's final durable position. */
  getThreadRunEventsThrough?(threadId: string, runId: string): Promise<PlicoEvent[]>;
  persistEvalReport(report: EvalReport): Promise<void>;
  getLatestEvalReport(): Promise<EvalReport | undefined>;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
  /** Open an existing database without changing it. Adds no files unless it has a pending WAL. */
  readOnly?: boolean;
}
