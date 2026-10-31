import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EvalReport, PlicoEvent, RunSummary } from "@plico/contracts";
import type { CreateSqliteEventStoreOptions, EventStore, PersistedRun } from "../../types/index.js";
import {
  persistEvalReportRecord,
  persistRunRecord,
  readEvents,
  readLatestEvalReport,
  readRunSummaries,
  readRunSummary,
} from "./queries.js";
import { initializeSchema } from "./schema.js";

export function createSqliteEventStore({
  databasePath,
  readOnly = false,
}: CreateSqliteEventStoreOptions): EventStore {
  if (!readOnly) mkdirSyncParent(databasePath);
  const database = new DatabaseSync(databasePath, { readOnly });
  database.exec("PRAGMA busy_timeout = 5000;");
  if (!readOnly) {
    database.exec("PRAGMA journal_mode = WAL;");
    initializeSchema(database);
  }

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
    async persistEvalReport(report: EvalReport): Promise<void> {
      persistEvalReportRecord(database, report);
    },
    async getLatestEvalReport(): Promise<EvalReport | undefined> {
      return readLatestEvalReport(database);
    },
  };
}

function mkdirSyncParent(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });
}
