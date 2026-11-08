import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { servePlico } from "./index.js";

it("serves reads but refuses every change when inspecting", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-inspect-"));
  const server = await servePlico({
    projectRoot: root,
    databasePath: join(root, "state.sqlite"),
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
