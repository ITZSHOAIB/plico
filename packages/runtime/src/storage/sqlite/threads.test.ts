import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createSqliteThreadStore } from "../../index.js";

it("persists thread events and projects messages across database reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-threads-"));
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteThreadStore({ databasePath });
  const thread = await store.createThread();
  const message = await store.addMessage(thread.id, "Hello");
  expect(message).toMatchObject({ threadId: thread.id, role: "user", content: "Hello" });
  const reopened = createSqliteThreadStore({ databasePath });
  expect(await reopened.listThreads()).toEqual([thread]);
  expect(await reopened.getThread(thread.id)).toEqual(thread);
  expect(await reopened.getMessages(thread.id)).toEqual([message]);
  expect((await reopened.getEvents(thread.id)).map((event) => event.type)).toEqual([
    "thread.created",
    "message.created",
  ]);
});

it("rejects a thread event with an unsupported schema version", async () => {
  const databasePath = join(await mkdtemp(join(tmpdir(), "plico-thread-version-")), "state.sqlite");
  const store = createSqliteThreadStore({ databasePath });
  const thread = await store.createThread();
  const db = new DatabaseSync(databasePath);
  db.prepare(
    "UPDATE events SET schema_version = 2 WHERE stream_type = 'thread' AND stream_id = ?",
  ).run(thread.id);
  db.close();
  await expect(store.getEvents(thread.id)).rejects.toThrow(/schema version/i);
});

it("keeps event order and message projections consistent across writers", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-writers-"));
  const databasePath = join(root, "state.sqlite");
  const first = createSqliteThreadStore({ databasePath });
  const second = createSqliteThreadStore({ databasePath });
  const thread = await first.createThread();
  const messages = await Promise.all([
    first.addMessage(thread.id, "first"),
    second.addMessage(thread.id, "second"),
  ]);
  expect(await first.getMessages(thread.id)).toEqual(messages);
  expect((await first.getEvents(thread.id)).map((event) => event.sequence)).toEqual([1, 2, 3]);
  expect(await first.addMessage("missing", "hello")).toBeUndefined();
});
