import type { DatabaseSync } from "node:sqlite";
import type { EvalReport, PlicoEvent, RunStatus, RunSummary } from "@plico/contracts";
import { runStreamType } from "../../events.js";

export function readRunSummaries(database: DatabaseSync): RunSummary[] {
  const rows = database
    .prepare(
      `
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output
        FROM runs
        ORDER BY started_at DESC, run_id DESC
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => rowToRunSummary(row));
}

export function readRunSummary(database: DatabaseSync, runId: string): RunSummary | undefined {
  const row = database
    .prepare(
      `
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output
        FROM runs
        WHERE run_id = ?
      `,
    )
    .get(runId) as Record<string, unknown> | undefined;

  return row ? rowToRunSummary(row) : undefined;
}

export function readEvents(
  database: DatabaseSync,
  runId: string,
  afterSequence: number | undefined,
): PlicoEvent[] {
  const rows = database
    .prepare(
      `
        SELECT stream_id, sequence, event_id, schema_version, type, timestamp, payload_json
        FROM events
        WHERE stream_type = ? AND stream_id = ? AND sequence > ?
        ORDER BY sequence ASC
      `,
    )
    .all(runStreamType, runId, afterSequence ?? 0) as Array<Record<string, unknown>>;

  return rows.map((row) => rowToEvent(row));
}

export function persistEvalReportRecord(database: DatabaseSync, report: EvalReport): void {
  database
    .prepare("INSERT INTO eval_reports (evaluated_at, report_json) VALUES (?, ?)")
    .run(report.evaluatedAt, JSON.stringify(report));
}

export function readLatestEvalReport(database: DatabaseSync): EvalReport | undefined {
  // Read-only stores skip schema setup, so older databases may lack this table.
  const hasTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'eval_reports'")
    .get();
  if (!hasTable) return undefined;

  const row = database
    .prepare("SELECT report_json FROM eval_reports ORDER BY id DESC LIMIT 1")
    .get() as { report_json: string } | undefined;
  if (!row) return undefined;

  // A report from another version is not readable here; the next eval run replaces it.
  const report = JSON.parse(row.report_json) as EvalReport;
  return report.schemaVersion === 1 ? report : undefined;
}

function rowToRunSummary(row: Record<string, unknown>): RunSummary {
  return {
    runId: String(row.run_id),
    projectRoot: String(row.project_root),
    projectName: String(row.project_name),
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    endedAt: row.ended_at === null ? null : String(row.ended_at),
    ...(row.output === null || row.output === undefined ? {} : { output: String(row.output) }),
  };
}

function rowToEvent(row: Record<string, unknown>): PlicoEvent {
  // Stored rows are trusted, not validated; pre-publication rows may have status and lack requestId and are not migrated.
  return {
    schemaVersion: 1,
    streamType: runStreamType,
    streamId: String(row.stream_id),
    runId: String(row.stream_id),
    id: String(row.event_id),
    sequence: Number(row.sequence),
    timestamp: String(row.timestamp),
    type: row.type as PlicoEvent["type"],
    payload: JSON.parse(String(row.payload_json)),
  } as PlicoEvent;
}
