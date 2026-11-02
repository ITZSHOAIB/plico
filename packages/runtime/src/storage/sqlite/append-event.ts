import type { DatabaseSync } from "node:sqlite";
import type { PlicoEvent } from "@plico/contracts";
import { acquireOwner } from "./owner-lock.js";

export function appendEventRecord(database: DatabaseSync, event: PlicoEvent): void {
  if (event.streamType !== "run" || event.streamId !== event.runId) {
    throw new Error("Event must belong to its run stream.");
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database
      .prepare(
        "SELECT event_id, type, timestamp, payload_json FROM events WHERE stream_type = ? AND stream_id = ? AND sequence = ?",
      )
      .get(event.streamType, event.streamId, event.sequence) as Record<string, unknown> | undefined;
    if (existing) {
      if (
        existing.event_id !== event.id ||
        existing.type !== event.type ||
        existing.timestamp !== event.timestamp ||
        existing.payload_json !== JSON.stringify(event.payload)
      ) {
        throw new Error(`Conflicting event at sequence ${event.sequence}.`);
      }
      database.exec("COMMIT");
      return;
    }
    const row = database.prepare("SELECT status FROM runs WHERE run_id = ?").get(event.runId) as
      | { status: string }
      | undefined;
    const last = database
      .prepare(
        "SELECT sequence, type FROM events WHERE stream_type = ? AND stream_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(event.streamType, event.streamId) as { sequence: number; type: string } | undefined;
    if (event.sequence !== (last?.sequence ?? 0) + 1)
      throw new Error("Events must be appended in sequence.");
    if (last?.type === "run.error" && event.type !== "run.failed") {
      throw new Error("run.error must be followed by run.failed.");
    }
    if (!row) {
      if (event.type !== "run.started" || event.sequence !== 1)
        throw new Error("The first event must be run.started.");
      database
        .prepare(
          "INSERT INTO runs (run_id, project_root, project_name, status, started_at, ended_at) VALUES (?, ?, ?, 'running', ?, NULL)",
        )
        .run(
          event.runId,
          String(event.payload.projectRoot ?? ""),
          String(event.payload.projectName ?? ""),
          event.timestamp,
        );
      const owner = acquireOwner();
      database
        .prepare(
          "INSERT INTO run_owners (run_id, process_id, owner_token, owner_path) VALUES (?, ?, ?, ?)",
        )
        .run(event.runId, process.pid, owner.token, owner.path);
    } else {
      if (row.status !== "running")
        throw new Error(`Cannot append to run with status ${row.status}.`);
      if (event.type === "run.started") throw new Error("Run has already started.");
      const status =
        event.type === "run.waiting"
          ? "waiting"
          : event.type === "run.completed"
            ? "completed"
            : event.type === "run.failed"
              ? "failed"
              : event.type === "run.cancelled"
                ? "cancelled"
                : undefined;
      if (status) {
        const endedAt = status === "waiting" ? null : event.timestamp;
        const output =
          (event.type === "run.completed" || event.type === "run.waiting") &&
          typeof event.payload.output === "string"
            ? event.payload.output
            : null;
        database
          .prepare("UPDATE runs SET status = ?, ended_at = ?, output = ? WHERE run_id = ?")
          .run(status, endedAt, output, event.runId);
        // Drop the owner once the run leaves running, including waiting; recovery only inspects running runs.
        database.prepare("DELETE FROM run_owners WHERE run_id = ?").run(event.runId);
      }
    }
    database
      .prepare(
        "INSERT INTO events (stream_type, stream_id, sequence, event_id, schema_version, type, timestamp, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.streamType,
        event.streamId,
        event.sequence,
        event.id,
        event.schemaVersion,
        event.type,
        event.timestamp,
        JSON.stringify(event.payload),
      );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
