import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function start(options: { allowRemote?: boolean } = {}): Promise<number> {
  const root = await mkdtemp(join(tmpdir(), "plico-origin-"));
  await mkdir(join(root, "skills"), { recursive: true });
  const plico = await createPlicoServer({
    projectRoot: root,
    eventStore: createSqliteEventStore({ databasePath: join(root, "db.sqlite") }),
    ...options,
  });
  const server = createServer(plico.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

interface Reply {
  status: number;
  body: { error?: { code: string } };
}

function send(
  port: number,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers ?? {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {} });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

const script = JSON.stringify({ script: [{ type: "assistant.output", content: "hi" }] });

describe("browser request guard", () => {
  it("rejects a cross-origin text/plain run request without starting a run", async () => {
    const port = await start();

    const reply = await send(port, {
      method: "POST",
      path: "/v1/runs/dry",
      headers: { origin: "https://evil.example", "content-type": "text/plain" },
      body: script,
    });

    expect(reply.status).toBe(403);
    expect(reply.body.error?.code).toBe("request.origin_not_allowed");
    const runs = await send(port, { path: "/v1/runs" });
    expect(runs.body).toEqual([]);
  });

  it("rejects a foreign Origin even with a JSON content type", async () => {
    const port = await start();

    const reply = await send(port, {
      method: "POST",
      path: "/v1/runs/dry",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: script,
    });

    expect(reply.status).toBe(403);
  });

  it("rejects a forged approval signal from a rebinding host", async () => {
    const port = await start();

    const reply = await send(port, {
      method: "POST",
      path: "/v1/runs/run-1/signal",
      headers: {
        host: `rebind.attacker.example:${port}`,
        origin: `http://rebind.attacker.example:${port}`,
        "content-type": "text/plain",
      },
      body: JSON.stringify({ name: "approval:run-1:0", value: { approved: true } }),
    });

    expect(reply.status).toBe(421);
    expect(reply.body.error?.code).toBe("request.host_not_allowed");
  });

  it("rejects reads that arrive with a foreign Host header", async () => {
    const port = await start();

    const reply = await send(port, {
      path: "/v1/runs",
      headers: { host: `rebind.attacker.example:${port}` },
    });

    expect(reply.status).toBe(421);
  });

  it("rejects a JSON body sent with another content type", async () => {
    const port = await start();

    const reply = await send(port, {
      method: "POST",
      path: "/v1/runs/dry",
      headers: { "content-type": "text/plain" },
      body: script,
    });

    expect(reply.status).toBe(415);
    expect(reply.body.error?.code).toBe("request.unsupported_media_type");
  });

  it("serves a same-origin JSON request on a loopback host", async () => {
    const port = await start();
    const host = `127.0.0.1:${port}`;

    const reply = await send(port, {
      method: "POST",
      path: "/v1/runs/dry",
      headers: {
        host,
        origin: `http://${host}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: script,
    });

    expect(reply.status).toBe(200);
  });

  it("serves clients that send no Origin, such as curl and the CLI", async () => {
    const port = await start();

    const reply = await send(port, { path: "/health", headers: { host: `localhost:${port}` } });

    expect(reply.status).toBe(200);
  });

  it("accepts a non-loopback Host when the host app opts in with allowRemote", async () => {
    const port = await start({ allowRemote: true });
    const host = `plico.internal.example:${port}`;

    const same = await send(port, { path: "/health", headers: { host, origin: `http://${host}` } });
    const foreign = await send(port, {
      path: "/health",
      headers: { host, origin: "https://evil.example" },
    });

    expect(same.status).toBe(200);
    expect(foreign.status).toBe(403);
  });
});
