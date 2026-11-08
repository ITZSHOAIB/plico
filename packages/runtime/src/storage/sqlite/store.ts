import { resolve } from "node:path";
import type { EvalReport, PlicoEvent, RunSummary } from "@plico/contracts";
import type { CreateSqliteEventStoreOptions, EventStore } from "../../types/index.js";
import { matchesMetadata } from "../metadata.js";
import { appendEventRecord } from "./append-event.js";
import { openDatabase } from "./open.js";
import {
  persistEvalReportRecord,
  readEvents,
  readLatestEvalReport,
  readRunSummaries,
  readRunSummary,
  readThreadRunEvents,
  readThreadRunEventsThrough,
} from "./queries.js";
import { recoverInterruptedRuns } from "./recover-interrupted.js";

export function createSqliteEventStore({
  databasePath,
  readOnly = false,
}: CreateSqliteEventStoreOptions): EventStore {
  const database = openDatabase(databasePath, readOnly);
  if (!readOnly) {
    try {
      recoverInterruptedRuns(database);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  return {
    ...(databasePath === ":memory:"
      ? {}
      : {
          storageIdentity:
            process.platform === "win32"
              ? resolve(databasePath).toLowerCase()
              : resolve(databasePath),
        }),
    async appendEvent(event: PlicoEvent): Promise<void> {
      appendEventRecord(database, event);
    },
    async listRuns(filter): Promise<RunSummary[]> {
      return readRunSummaries(database).filter((run) =>
        matchesMetadata(run.metadata, filter?.metadata),
      );
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
    async getThreadRunEvents(threadId: string): Promise<PlicoEvent[]> {
      return readThreadRunEvents(database, threadId);
    },
    async getThreadRunEventsThrough(threadId: string, runId: string): Promise<PlicoEvent[]> {
      return readThreadRunEventsThrough(database, threadId, runId);
    },
    async persistEvalReport(report: EvalReport): Promise<void> {
      persistEvalReportRecord(database, report);
    },
    async getLatestEvalReport(): Promise<EvalReport | undefined> {
      return readLatestEvalReport(database);
    },
  };
}
