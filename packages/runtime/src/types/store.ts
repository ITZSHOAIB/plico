import type { PlicoEvent, RunSummary } from "@plico/contracts";

export interface PersistedRun extends RunSummary {
  events: PlicoEvent[];
}

export interface EventStore {
  persistRun(run: PersistedRun): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunSummary | undefined>;
  getEvents(runId: string, options?: { afterSequence?: number }): Promise<PlicoEvent[]>;
}

export interface CreateSqliteEventStoreOptions {
  databasePath: string;
}
