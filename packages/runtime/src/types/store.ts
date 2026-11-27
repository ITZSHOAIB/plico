import type { EvalReport, JsonValue, PlicoEvent, RunSummary } from "@plico-ai/contracts";

export interface EventStore {
  readonly storageIdentity?: string;
  appendEvent(event: PlicoEvent): Promise<void>;
  /**
   * Lists root runs, newest first. `metadata` keeps runs whose top-level keys equal every given
   * value; `parentRunId` lists that run's child runs instead.
   */
  listRuns(filter?: {
    metadata?: Record<string, JsonValue>;
    parentRunId?: string;
  }): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
  /** Returns run events in a thread, ordered by their durable insertion order. */
  getThreadRunEvents?(threadId: string): Promise<PlicoEvent[]>;
  /** Returns thread run events through the selected run's final durable position. */
  getThreadRunEventsThrough?(threadId: string, runId: string): Promise<PlicoEvent[]>;
  /** Every event of a root run and its child runs, in the order they were written. */
  getRunTreeEvents?(rootRunId: string): Promise<PlicoEvent[]>;
  persistEvalReport(report: EvalReport): Promise<void>;
  getLatestEvalReport(): Promise<EvalReport | undefined>;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
  /** Open an existing database without changing it. Adds no files unless it has a pending WAL. */
  readOnly?: boolean;
}
