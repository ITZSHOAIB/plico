import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, createSqliteThreadStore, type ThreadStore } from "@plico/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestServer } from "./testing/test-server.js";

interface Titled {
  id: string;
  title?: string;
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function start() {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-titles-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", model: { provider: "openai-compatible", name: "test" } };',
  );
  await writeFile(join(root, "agent.md"), "instructions");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore: ThreadStore = createSqliteThreadStore({ databasePath });
  const api = await createTestServer({
    projectRoot: root,
    eventStore,
    threadStore,
    provider: {
      async *stream() {
        yield { type: "text", text: "Understood, working on it." };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 2 } };
      },
    },
  });
  const server: Server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
    () => threadStore.close(),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const json = (path: string, init?: RequestInit) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json" },
    });
  const newThread = async () =>
    (await (await json("/v1/threads", { method: "POST" })).json()) as Titled;
  const getThread = async (id: string) =>
    (await (await json(`/v1/threads/${id}`)).json()) as Titled;
  async function say(threadId: string, content: string) {
    const response = await json(`/v1/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    const { runId } = (await response.json()) as { runId: string };
    await vi.waitFor(async () =>
      expect((await eventStore.getRun(runId))?.status).toBe("completed"),
    );
  }
  const rename = (threadId: string, title: unknown) =>
    json(`/v1/threads/${threadId}`, { method: "PATCH", body: JSON.stringify({ title }) });
  return { json, newThread, getThread, say, rename, threadStore };
}

describe("thread titles", () => {
  it("leaves a thread untitled through a greeting, then names it from the topic", async () => {
    const { newThread, getThread, say } = await start();
    const thread = await newThread();
    expect(thread.title).toBeUndefined();

    await say(thread.id, "Hi");
    expect((await getThread(thread.id)).title).toBeUndefined();

    await say(thread.id, "I need to reset the VPN token for the Berlin office");
    expect((await getThread(thread.id)).title).toBe("VPN token · Berlin office");
  });

  it("shows the title when listing threads", async () => {
    const { newThread, json, say } = await start();
    const thread = await newThread();
    await say(thread.id, "Please summarise the quarterly invoice totals");

    const listed = (await (await json("/v1/threads")).json()) as Titled[];

    expect(listed[0]?.title).toMatch(/invoice/i);
  });

  it("stops retitling after three exchanges", async () => {
    const { newThread, getThread, say } = await start();
    const thread = await newThread();
    await say(thread.id, "Reset the VPN token for the Berlin office");
    await say(thread.id, "Also the Berlin office VPN token needs a new expiry");
    await say(thread.id, "And confirm the VPN token in Berlin works");
    const frozen = (await getThread(thread.id)).title;

    await say(thread.id, "Unrelated: book a flight to Tokyo for the payroll audit");

    expect((await getThread(thread.id)).title).toBe(frozen);
  });

  it("renames a thread and keeps the user's title through later exchanges", async () => {
    const { newThread, getThread, say, rename, threadStore } = await start();
    const thread = await newThread();

    const response = await rename(thread.id, "  Berlin VPN  ");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: thread.id, title: "Berlin VPN" });
    await say(thread.id, "Please reset the VPN token for the Berlin office");
    expect((await getThread(thread.id)).title).toBe("Berlin VPN");
    expect((await threadStore.getEvents(thread.id)).map((event) => event.type)).toContain(
      "thread.titled",
    );
  });

  it.each([
    ["an empty title", ""],
    ["a blank title", "   "],
    ["a non-string title", 42],
    ["an overlong title", "x".repeat(201)],
  ])("rejects %s with 400", async (_name, title) => {
    const { newThread, rename } = await start();
    const thread = await newThread();

    const response = await rename(thread.id, title);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "thread.invalid_title" } });
  });

  it("answers 404 when renaming an unknown thread", async () => {
    const { rename } = await start();

    const response = await rename("missing", "Anything");

    expect(response.status).toBe(404);
  });
});
