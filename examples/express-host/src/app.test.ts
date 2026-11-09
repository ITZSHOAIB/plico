import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlico } from "@plico-ai/server";
import { expect, it } from "vitest";
import { createApp } from "./app.js";

it("keeps each logged-in user's threads to themselves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plico-express-"));
  const plico = await createPlico({
    projectRoot: "examples/express-host/agent",
    databasePath: join(dir, "state.sqlite"),
  });
  const server = createApp(plico).listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/plico`;
    const as = (user: string | undefined, path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(user ? { "x-user-id": user } : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });

    expect((await as(undefined, "/v1/threads")).status).toBe(401);

    const created = await as("ann", "/v1/threads", { method: "POST", body: "{}" });
    expect(created.status).toBe(201);
    const thread = (await created.json()) as { id: string; metadata: unknown };
    expect(thread.metadata).toEqual({ userId: "ann" });

    expect((await as("ann", `/v1/threads/${thread.id}`)).status).toBe(200);
    expect((await as("bob", `/v1/threads/${thread.id}`)).status).toBe(404);
    expect(await (await as("bob", "/v1/threads")).json()).toEqual([]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await plico.close();
  }
});
