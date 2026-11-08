import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, createSqliteThreadStore } from "@plico/runtime";
import { describe, expect, it, vi } from "vitest";
import { createPlico } from "./index.js";
import { createTestServer } from "./testing/test-server.js";

async function openPlico(): Promise<Awaited<ReturnType<typeof createPlico>>> {
  const root = await mkdtemp(join(tmpdir(), "plico-metadata-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Metadata Agent" };',
  );
  await writeFile(join(root, "agent.md"), "Answer briefly.");
  return createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
}

describe("metadata", () => {
  it("stores thread metadata at creation and filters lists by exact top-level keys", async () => {
    const plico = await openPlico();
    try {
      const acme = await plico.threads.create({ metadata: { tenant: "acme", plan: { tier: 1 } } });
      const globex = await plico.threads.create({ metadata: { tenant: "globex" } });
      const bare = await plico.threads.create();

      expect(acme.metadata).toEqual({ tenant: "acme", plan: { tier: 1 } });
      expect(bare.metadata).toBeUndefined();
      expect((await plico.threads.get(acme.id))?.metadata).toEqual(acme.metadata);

      const ids = async (metadata?: Record<string, unknown>) =>
        (await plico.threads.list(metadata === undefined ? {} : { metadata: metadata as never }))
          .map((thread) => thread.id)
          .sort();
      expect(await ids({ tenant: "acme" })).toEqual([acme.id]);
      expect(await ids({ tenant: "globex" })).toEqual([globex.id]);
      expect(await ids({ tenant: "acme", plan: { tier: 1 } })).toEqual([acme.id]);
      expect(await ids({ tenant: "acme", plan: { tier: 2 } })).toEqual([]);
      expect(await ids()).toHaveLength(3);
    } finally {
      await plico.close();
    }
  });

  it("rejects metadata that is not a JSON object", async () => {
    const plico = await openPlico();
    try {
      await expect(plico.threads.create({ metadata: ["a"] as never })).rejects.toMatchObject({
        code: "request.invalid",
      });
      await expect(
        plico.threads.create({ metadata: { when: undefined } as never }),
      ).rejects.toMatchObject({ code: "request.invalid" });
    } finally {
      await plico.close();
    }
  });

  it("stamps run metadata and filters runs by it", async () => {
    const plico = await openPlico();
    try {
      const { runId } = await plico.runs.start({ metadata: { tenant: "acme" } });
      for await (const _event of plico.runs.events(runId)) {
        // drain until the run ends
      }
      await plico.runs.start();

      expect((await plico.runs.get(runId))?.metadata).toEqual({ tenant: "acme" });
      expect((await plico.runs.list({ metadata: { tenant: "acme" } })).map((r) => r.runId)).toEqual(
        [runId],
      );
      expect(await plico.runs.list({ metadata: { tenant: "other" } })).toEqual([]);
    } finally {
      await plico.close();
    }
  });

  it("gives a thread's runs the thread's metadata and serves filters over HTTP", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-metadata-http-"));
    for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
      await mkdir(join(root, dir), { recursive: true });
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Demo", model: { provider: "fake", name: "test" } };',
    );
    await writeFile(join(root, "agent.md"), "instructions");
    const databasePath = join(root, "state.sqlite");
    const eventStore = createSqliteEventStore({ databasePath });
    const threadStore = createSqliteThreadStore({ databasePath });
    const api = createTestServer({
      projectRoot: root,
      eventStore,
      threadStore,
      provider: {
        async *stream() {
          yield { type: "text", text: "Hi" };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    const server = createServer(api.requestListener);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const json = { "content-type": "application/json" };
    try {
      const created = await fetch(`${base}/v1/threads`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ metadata: { tenant: "acme" } }),
      });
      expect(created.status).toBe(201);
      const thread = (await created.json()) as { id: string; metadata: unknown };
      expect(thread.metadata).toEqual({ tenant: "acme" });
      await fetch(`${base}/v1/threads`, { method: "POST", headers: json, body: "{}" });

      const filter = (value: unknown) => encodeURIComponent(JSON.stringify(value));
      const acme = (await (
        await fetch(`${base}/v1/threads?metadata=${filter({ tenant: "acme" })}`)
      ).json()) as unknown[];
      expect(acme).toHaveLength(1);
      expect(await (await fetch(`${base}/v1/threads`)).json()).toHaveLength(2);
      expect((await fetch(`${base}/v1/threads?metadata=nope`)).status).toBe(400);
      expect((await fetch(`${base}/v1/threads?metadata=${filter(["a"])}`)).status).toBe(400);

      const message = await api.plico.threads.send(thread.id, "Hello");
      await vi.waitFor(async () =>
        expect((await eventStore.getRun(message.runId as string))?.status).toBe("completed"),
      );
      const runs = (await (
        await fetch(`${base}/v1/runs?metadata=${filter({ tenant: "acme" })}`)
      ).json()) as Array<{ runId: string; metadata: unknown }>;
      expect(runs.map((run) => run.runId)).toEqual([message.runId]);
      expect(runs[0]?.metadata).toEqual({ tenant: "acme" });
      expect(
        await (await fetch(`${base}/v1/runs?metadata=${filter({ tenant: "other" })}`)).json(),
      ).toEqual([]);

      const started = await fetch(`${base}/v1/runs`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ metadata: "no" }),
      });
      expect(started.status).toBe(400);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      threadStore.close();
    }
  });
});
