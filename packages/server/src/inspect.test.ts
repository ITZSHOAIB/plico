import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSqliteEventStore } from "@plico-ai/runtime";
import { expect, it } from "vitest";
import { servePlico } from "./index.js";

/** What a host leaves behind: a database, here with a run that has events but no engine record. */
async function seedHostDatabase(root: string, runId?: string): Promise<string> {
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteEventStore({ databasePath });
  if (runId)
    await store.appendEvent({
      schemaVersion: 1,
      streamType: "run",
      streamId: runId,
      runId,
      timestamp: "2026-01-01T00:00:00.000Z",
      id: "evt-0001",
      sequence: 1,
      type: "run.started",
      payload: { projectRoot: root, projectName: "Host" },
    });
  if (runId) {
    // The host died: nothing owns the run and no engine record exists.
    const database = new DatabaseSync(databasePath);
    database.prepare("DELETE FROM run_owners WHERE run_id = ?").run(runId);
    database.close();
  }
  return databasePath;
}

it("serves reads but refuses every change when inspecting", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-inspect-"));
  const server = await servePlico({
    projectRoot: root,
    databasePath: await seedHostDatabase(root),
    port: 0,
    inspect: true,
  });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${base}/health`);
    expect(await health.json()).toEqual({ ok: true, inspection: true });
    expect((await fetch(`${base}/v1/threads`)).status).toBe(200);
    expect((await fetch(`${base}/v1/runs`)).status).toBe(200);

    const attempts: Array<[string, string]> = [
      ["POST", "/v1/threads"],
      ["POST", "/v1/runs"],
      ["POST", "/v1/runs/run-1/cancel"],
      ["POST", "/v1/runs/run-1/signal"],
      ["POST", "/v1/threads/thread-1/messages"],
      ["PATCH", "/v1/threads/thread-1"],
      ["POST", "/v1/eval"],
    ];
    for (const [method, path] of attempts) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status, `${method} ${path}`).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("inspection.read_only");
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

it("reports no inspection flag on a normal server", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-inspect-off-"));
  const server = await servePlico({
    projectRoot: root,
    databasePath: join(root, "state.sqlite"),
    port: 0,
  });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

it("leaves a run the host owns exactly as it found it", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-inspect-run-"));
  const databasePath = await seedHostDatabase(root, "run-host");
  const server = await servePlico({ projectRoot: root, databasePath, port: 0, inspect: true });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const run = (await (await fetch(`${base}/v1/runs/run-host`)).json()) as { status: string };
    const events = (await (await fetch(`${base}/v1/runs/run-host/events`)).json()) as unknown[];

    expect(run.status).toBe("running");
    expect(events).toHaveLength(1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
