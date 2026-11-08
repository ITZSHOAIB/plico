import { mkdtemp } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { servePlico } from "./index.js";

function get(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/health", headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

it("accepts the configured public origin passed to servePlico", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-serve-origin-"));
  const server = await servePlico({
    projectRoot: root,
    databasePath: join(root, "state.sqlite"),
    port: 0,
    allowRemote: true,
    publicOrigin: "https://plico.example",
  });
  try {
    const port = (server.address() as AddressInfo).port;
    const headers = { host: "plico.example" };

    expect(await get(port, { ...headers, origin: "https://plico.example" })).toBe(200);
    expect(await get(port, { ...headers, origin: "http://plico.example" })).toBe(403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
