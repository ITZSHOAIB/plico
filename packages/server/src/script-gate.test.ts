import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico-ai/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "./testing/test-server.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function start(allowScript?: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-script-gate-"));
  await mkdir(join(root, "skills"), { recursive: true });
  const plico = await createTestServer({
    projectRoot: root,
    eventStore: createSqliteEventStore({ databasePath: join(root, "db.sqlite") }),
    ...(allowScript === undefined ? {} : { allowScript }),
  });
  const server = createServer(plico.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("scripted runs over HTTP", () => {
  const script = [{ type: "assistant.output", content: "Hi" }];

  it.each(["/v1/runs", "/v1/runs/dry"])("refuses a script on %s by default", async (path) => {
    const base = await start();

    const response = await post(base, path, { script });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "run.script_disabled" } });
    const runs = await (await fetch(`${base}/v1/runs`)).json();
    expect(runs).toEqual([]);
  });

  it("accepts a script when the server opts in", async () => {
    const base = await start(true);

    const response = await post(base, "/v1/runs/dry", { script });

    expect(response.status).toBe(200);
  });
});
