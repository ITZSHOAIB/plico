import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, type EventStore } from "@plico/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function start(
  options: { studioPath?: string; eventStore?: EventStore } = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-hardening-"));
  await mkdir(join(root, "skills"), { recursive: true });
  const eventStore =
    options.eventStore ?? createSqliteEventStore({ databasePath: join(root, "db.sqlite") });
  const plico = await createPlicoServer({
    projectRoot: root,
    eventStore,
    ...(options.studioPath ? { studioPath: options.studioPath } : {}),
  });
  const server = createServer(plico.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("server hardening", () => {
  it("answers 400 for a malformed percent-encoded run id", async () => {
    const base = await start();

    const response = await fetch(`${base}/v1/runs/%E0%A4%A`);

    expect(response.status).toBe(400);
  });

  it("answers 405 when a known route is hit with the wrong method", async () => {
    const base = await start();

    const response = await fetch(`${base}/v1/runs`, { method: "DELETE" });

    expect(response.status).toBe(405);
  });

  it("rejects oversized request bodies with 413", async () => {
    const base = await start();

    const response = await fetch(`${base}/v1/runs/dry`, {
      method: "POST",
      body: JSON.stringify({ script: [], padding: "x".repeat(2 * 1024 * 1024) }),
    });

    expect(response.status).toBe(413);
  });

  it("does not leak internal error details on unexpected failures", async () => {
    const failing = {
      ...createSqliteEventStore({
        databasePath: join(tmpdir(), `plico-fail-${Date.now()}.sqlite`),
      }),
      listRuns: async () => {
        throw new Error("secret path C:internal");
      },
    } as EventStore;
    const base = await start({ eventStore: failing });

    const response = await fetch(`${base}/v1/runs`);

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Internal server error.");
  });

  it("does not serve files from a sibling directory sharing the studio path prefix", async () => {
    const parent = await mkdtemp(join(tmpdir(), "plico-static-"));
    await mkdir(join(parent, "dist"));
    await mkdir(join(parent, "dist-secret"));
    await writeFile(join(parent, "dist", "index.html"), "<p>studio</p>");
    await writeFile(join(parent, "dist-secret", "key.txt"), "secret");
    const base = await start({ studioPath: join(parent, "dist") });

    const response = await fetch(`${base}/..%2Fdist-secret%2Fkey.txt`);

    expect(await response.text()).not.toContain("secret");
  });
});
