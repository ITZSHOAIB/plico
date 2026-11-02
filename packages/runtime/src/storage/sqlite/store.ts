import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { EvalReport, PlicoEvent, RunSummary } from "@plico/contracts";
import type { CreateSqliteEventStoreOptions, EventStore } from "../../types/index.js";
import { appendEventRecord } from "./append-event.js";
import {
  persistEvalReportRecord,
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
  const database = new DatabaseSync(readOnly ? readOnlySource(databasePath) : databasePath, {
    readOnly,
  });
  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    if (!readOnly) {
      // WAL setup is outside the schema transaction; concurrent first opens use busy_timeout.
      database.exec("PRAGMA journal_mode = WAL;");
      initializeSchema(database);
    }
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    async appendEvent(event: PlicoEvent): Promise<void> {
      appendEventRecord(database, event);
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

// A plain read-only open of a WAL database creates -shm and -wal files. Immutable mode
// avoids them but ignores WAL content, so it is only safe when no -wal file exists.
function readOnlySource(databasePath: string): string | URL {
  if (existsSync(`${databasePath}-wal`)) return databasePath;

  const url = pathToFileURL(databasePath);
  url.searchParams.set("immutable", "1");
  return url;
}

function mkdirSyncParent(databasePath: string): void {
  mkdirSync(dirname(databasePath), { recursive: true });
}
