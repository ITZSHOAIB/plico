import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, createSqliteThreadStore } from "@plico/runtime";
import { expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

it("creates and reads a durable thread and its messages through HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-api-"));
  const databasePath = join(root, "state.sqlite");
  const start = async () => {
    const api = await createPlicoServer({
      projectRoot: root,
      eventStore: createSqliteEventStore({ databasePath }),
      threadStore: createSqliteThreadStore({ databasePath }),
    });
    const server = createServer(api.requestListener);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };
  const first = await start();
  try {
    const created = await fetch(`${first.url}/v1/threads`, { method: "POST" });
    expect(created.status).toBe(201);
    const thread = (await created.json()) as { id: string };
    const sent = await fetch(`${first.url}/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello" }),
    });
    expect(sent.status).toBe(201);
    const message = await sent.json();
    const second = await start();
    try {
      expect(await (await fetch(`${second.url}/v1/threads`)).json()).toEqual([thread]);
      expect(await (await fetch(`${second.url}/v1/threads/${thread.id}`)).json()).toEqual(thread);
      expect(await (await fetch(`${second.url}/v1/threads/${thread.id}/messages`)).json()).toEqual([
        message,
      ]);
      expect((await fetch(`${second.url}/v1/threads/missing`)).status).toBe(404);
      expect(
        (
          await fetch(`${second.url}/v1/threads/${thread.id}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: "" }),
          })
        ).status,
      ).toBe(400);
    } finally {
      await new Promise<void>((resolve) => second.server.close(() => resolve()));
    }
  } finally {
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
  }
});
