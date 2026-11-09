import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlicoEvent } from "@plico-ai/contracts";
import { createSqliteEventStore } from "@plico-ai/runtime";
import { describe, expect, it } from "vitest";
import { createPlico } from "./index.js";
import { createTestServer } from "./testing/test-server.js";

async function writeProject(root: string): Promise<void> {
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Embedded Agent" };',
  );
  await writeFile(join(root, "agent.md"), "Answer briefly.");
}

async function collect(events: AsyncIterable<PlicoEvent>): Promise<PlicoEvent[]> {
  const seen: PlicoEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe("createPlico", () => {
  it("opens a project and database and keeps threads across a restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-"));
    await writeProject(root);
    const databasePath = join(root, "state.sqlite");

    const first = await createPlico({ projectRoot: root, databasePath });
    const thread = await first.threads.create();
    const message = await first.threads.send(thread.id, "Remember this", { startRun: false });
    expect(message.content).toBe("Remember this");
    await first.close();

    const second = await createPlico({ projectRoot: root, databasePath });
    expect((await second.threads.list()).map((entry) => entry.id)).toEqual([thread.id]);
    expect((await second.threads.messages(thread.id)).map((entry) => entry.content)).toEqual([
      "Remember this",
    ]);
    await second.close();
  });

  it("rejects agent definitions passed in code", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-reject-"));
    await writeProject(root);
    await expect(
      createPlico({
        projectRoot: root,
        databasePath: join(root, "db.sqlite"),
        tools: [],
      } as never),
    ).rejects.toThrow(/files define the agent.*tools/);
  });

  it("reports coded errors without HTTP", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-errors-"));
    await writeProject(root);
    const plico = await createPlico({ projectRoot: root, databasePath: join(root, "db.sqlite") });
    try {
      expect(await plico.threads.get("missing")).toBeUndefined();
      await expect(plico.threads.send("missing", "hi")).rejects.toMatchObject({
        code: "thread.not_found",
      });
      const thread = await plico.threads.create();
      await expect(plico.threads.send(thread.id, "hi")).rejects.toMatchObject({
        code: "provider.unavailable",
      });
      await expect(plico.runs.cancel("missing")).rejects.toMatchObject({ code: "run.not_found" });
      await expect(plico.approvals.decide("missing", "req-1", true)).rejects.toMatchObject({
        code: "run.not_found",
      });
    } finally {
      await plico.close();
    }
  });

  it("starts a run and follows its events from a cursor as an async iterator", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-events-"));
    await writeProject(root);
    const plico = await createPlico({ projectRoot: root, databasePath: join(root, "db.sqlite") });
    try {
      const { runId } = await plico.runs.start({
        script: [{ type: "assistant.output", content: "Hello" }],
      });
      const all = await collect(plico.runs.events(runId, { pollMs: 10 }));
      expect(all[0]?.type).toBe("run.started");
      expect(all.at(-1)?.type).toBe("run.completed");
      expect((await plico.runs.get(runId))?.status).toBe("completed");
      expect((await plico.runs.list()).map((run) => run.runId)).toContain(runId);

      const rest = await collect(plico.runs.events(runId, { after: 1, pollMs: 10 }));
      expect(rest.map((event) => event.sequence)).toEqual(all.slice(1).map((e) => e.sequence));

      await expect(collect(plico.runs.events("missing"))).rejects.toMatchObject({
        code: "run.not_found",
      });
    } finally {
      await plico.close();
    }
  });

  it("ends a live event iterator when the caller aborts or Plico closes", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-stop-"));
    await writeProject(root);
    const eventStore = createSqliteEventStore({ databasePath: join(root, "db.sqlite") });
    const { plico } = createTestServer({ projectRoot: root, eventStore });
    await eventStore.appendEvent({
      schemaVersion: 1,
      streamType: "run",
      streamId: "run-live",
      runId: "run-live",
      id: "evt-0001",
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: "run.started",
      payload: { projectRoot: root, projectName: "Embedded Agent" },
    });

    const controller = new AbortController();
    const aborted = collect(
      plico.runs.events("run-live", { signal: controller.signal, pollMs: 10 }),
    );
    setTimeout(() => controller.abort(), 50);
    expect((await aborted).map((event) => event.type)).toEqual(["run.started"]);

    const closed = collect(plico.runs.events("run-live", { pollMs: 10 }));
    setTimeout(() => void plico.close(), 50);
    expect((await closed).map((event) => event.type)).toEqual(["run.started"]);
  });

  it("closes more than once without error", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-embed-close-"));
    await writeProject(root);
    const plico = await createPlico({ projectRoot: root, databasePath: join(root, "db.sqlite") });
    await plico.close();
    await expect(plico.close()).resolves.toBeUndefined();
  });
});
