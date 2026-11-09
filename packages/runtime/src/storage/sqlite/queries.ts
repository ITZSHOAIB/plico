import type { DatabaseSync } from "node:sqlite";
import type { EvalReport, PlicoEvent, RunStatus, RunSummary } from "@plico-ai/contracts";
import { runStreamType } from "../../events.js";
import { parseMetadata } from "../metadata.js";

export function readRunSummaries(database: DatabaseSync): RunSummary[] {
  const rows = database
    .prepare(
      `
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output, metadata_json
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
        SELECT run_id, project_root, project_name, status, started_at, ended_at, output, metadata_json
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
        SELECT events.stream_id, events.sequence, events.event_id, events.schema_version,
          events.type, events.timestamp, events.payload_json, artifact_content.content AS artifact_content
        FROM events
        LEFT JOIN artifact_content ON artifact_content.content_hash = json_extract(events.payload_json, '$.contentHash')
        WHERE stream_type = ? AND stream_id = ? AND sequence > ?
        ORDER BY sequence ASC
      `,
    )
    .all(runStreamType, runId, afterSequence ?? 0) as Array<Record<string, unknown>>;

  return rows.map((row) => rowToEvent(row));
}

export function readThreadRunEvents(database: DatabaseSync, threadId: string): PlicoEvent[] {
  const rows = database
    .prepare(
      `
        SELECT events.stream_id, events.sequence, events.event_id, events.schema_version,
          events.type, events.timestamp, events.payload_json, artifact_content.content AS artifact_content
        FROM events
        JOIN thread_runs ON thread_runs.run_id = events.stream_id
        LEFT JOIN artifact_content ON artifact_content.content_hash = json_extract(events.payload_json, '$.contentHash')
        WHERE events.stream_type = 'run' AND thread_runs.thread_id = ?
        ORDER BY events.position ASC
      `,
    )
    .all(threadId) as Array<Record<string, unknown>>;

  return rows.map((row) => rowToEvent(row));
}

export function readThreadRunEventsThrough(
  database: DatabaseSync,
  threadId: string,
  runId: string,
): PlicoEvent[] {
  const rows = database
    .prepare(
      `
        WITH selected_run_position AS (
          SELECT MAX(target_events.position) AS position
          FROM events AS target_events
          JOIN thread_runs AS target_runs ON target_runs.run_id = target_events.stream_id
          WHERE target_events.stream_type = 'run'
            AND target_runs.thread_id = ?
            AND target_events.stream_id = ?
        )
        SELECT events.stream_id, events.sequence, events.event_id, events.schema_version,
          events.type, events.timestamp, events.payload_json, artifact_content.content AS artifact_content
        FROM events
        JOIN thread_runs ON thread_runs.run_id = events.stream_id
        LEFT JOIN artifact_content ON artifact_content.content_hash = json_extract(events.payload_json, '$.contentHash')
        WHERE events.stream_type = 'run' AND thread_runs.thread_id = ?
          AND events.position <= (SELECT position FROM selected_run_position)
        ORDER BY events.position ASC
      `,
    )
    .all(threadId, runId, threadId) as Array<Record<string, unknown>>;

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
  const metadata = parseMetadata(row.metadata_json);
  return {
    runId: String(row.run_id),
    projectRoot: String(row.project_root),
    projectName: String(row.project_name),
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    endedAt: row.ended_at === null ? null : String(row.ended_at),
    ...(row.output === null || row.output === undefined ? {} : { output: String(row.output) }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function rowToEvent(row: Record<string, unknown>): PlicoEvent {
  // Stored rows are trusted, not validated; pre-publication rows may have status and lack requestId and are not migrated.
  const payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
  if (row.type === "artifact.file.written" && typeof payload.contentHash === "string") {
    if (!(row.artifact_content instanceof Uint8Array)) {
      // Missing artifact bodies make the canonical event log incomplete, so fail the read instead
      // of returning a workspace that looks complete but silently omits an artifact version.
      throw new Error(`Artifact content ${payload.contentHash} is missing from storage.`);
    }
    const bytes = Buffer.from(row.artifact_content);
    payload.content =
      payload.contentEncoding === "base64"
        ? { encoding: "base64", data: bytes.toString("base64") }
        : bytes.toString("utf8");
    delete payload.contentEncoding;
  }
  return {
    schemaVersion: 1,
    streamType: runStreamType,
    streamId: String(row.stream_id),
    runId: String(row.stream_id),
    id: String(row.event_id),
    sequence: Number(row.sequence),
    timestamp: String(row.timestamp),
    type: row.type as PlicoEvent["type"],
    payload,
  } as PlicoEvent;
}
