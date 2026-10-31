import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PlicoEvent, RunSummary } from "@plico/contracts";
import type { CreateSqliteEventStoreOptions, EventStore, PersistedRun } from "../../types/index.js";
import { persistRunRecord, readEvents, readRunSummaries, readRunSummary } from "./queries.js";
import { initializeSchema } from "./schema.js";

export function createSqliteEventStore({
  databasePath,
}: CreateSqliteEventStoreOptions): EventStore {
  mkdirSyncParent(databasePath);
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  initializeSchema(database);

  return {
    async persistRun(run: PersistedRun): Promise<void> {
      persistRunRecord(database, run);
    },
    async listRuns(): Promise<RunSummary[]> {
      return readRunSummaries(database);
    },
    async getRun(runId: string): Promise<RunSummary | undefined> {
      return readRunSummary(database, runId);
    },
    async getEvents(
      runId: string,
      options: { afterSequence?: number } = {},
    ): Promise<PlicoEvent[]> {
      return readEvents(database, runId, options.afterSequence);
    },
  };
}

function mkdirSyncParent(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });
}
