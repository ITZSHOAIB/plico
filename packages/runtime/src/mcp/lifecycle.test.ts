import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { discoverMcpTools } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, serverFile, ticket } from "../testing/mcp-project.js";

afterEach(() => vi.unstubAllEnvs());

it.each(["stdio", "streamable-http"] as const)(
  "requires credential references before connecting over %s",
  async (transport) => {
    vi.stubEnv("PLICO_MCP_MISSING", undefined);
    const server = await mcpHttp([[ticket]]);
    try {
      const { root, loaded } = await project({
        docs:
          transport === "stdio"
            ? {
                transport,
                command: process.execPath,
                args: [serverFile],
                tools: ["get_ticket"],
                env: ["PLICO_MCP_MISSING"],
              }
            : {
                transport,
                url: server.url,
                tools: ["get_ticket"],
                headersEnv: { Authorization: "PLICO_MCP_MISSING" },
              },
      });
      await writeFile(join(root, "mcp-fixture.json"), JSON.stringify({ tools: [ticket] }));
      await expect(discoverMcpTools(loaded)).rejects.toThrow(/docs.*PLICO_MCP_MISSING/);
      expect(server.requests).toEqual([]);
      await expect(readFile(join(root, "mcp-process.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await server.close();
    }
  },
);

it("does not launch a source when discovery has already been cancelled", async () => {
  const { root, loaded } = await project({
    docs: {
      transport: "stdio",
      command: process.execPath,
      args: [serverFile],
      tools: ["get_ticket"],
    },
  });
  await writeFile(join(root, "mcp-fixture.json"), JSON.stringify({ tools: [ticket] }));
  await expect(discoverMcpTools(loaded, { signal: AbortSignal.abort() })).rejects.toThrow(
    /cancelled/,
  );
  await expect(readFile(join(root, "mcp-process.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["stdio", "streamable-http"] as const)(
  "bounds discovery and cleans up slow %s sources",
  async (transport) => {
    const server = await mcpHttp([[ticket]], 1000);
    try {
      const { root, loaded } = await project({
        slow:
          transport === "stdio"
            ? {
                transport,
                command: process.execPath,
                args: [serverFile],
                tools: ["get_ticket"],
              }
            : { transport, url: server.url, tools: ["get_ticket"] },
      });
      await writeFile(
        join(root, "mcp-fixture.json"),
        JSON.stringify({ tools: [ticket], delayListMs: 1000 }),
      );
      await expect(discoverMcpTools(loaded, { timeoutMs: 500 })).rejects.toThrow(/slow.*timed out/);
      if (transport === "stdio") {
        const observed = JSON.parse(await readFile(join(root, "mcp-process.json"), "utf8"));
        await vi.waitFor(() => expect(() => process.kill(observed.pid, 0)).toThrow());
      } else expect(server.requests.at(-1)?.method).toBe("DELETE");
    } finally {
      await server.close();
    }
  },
);

it("does not expose a server's raw error body when HTTP session cleanup fails", async () => {
  const server = await mcpHttp([[ticket]], 0, { deleteError: "Bearer fixture-secret" });
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    await expect(discoverMcpTools(loaded)).rejects.toThrow(
      "MCP server docs: session cleanup failed.",
    );
  } finally {
    await server.close();
  }
});

it("bounds cleanup when an HTTP server never answers session termination", async () => {
  const server = await mcpHttp([[ticket]], 0, { hangDelete: true });
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    const outcome = await Promise.race([
      discoverMcpTools(loaded, { timeoutMs: 500 }).then(
        () => "resolved",
        (error) => error.message,
      ),
      new Promise((resolve) => setTimeout(() => resolve("Cleanup has no deadline"), 1500)),
    ]);
    expect(outcome).toBe("MCP server docs: session cleanup failed.");
  } finally {
    await server.close();
  }
});

it("rejects HTTP redirects instead of forwarding configured credentials", async () => {
  const server = await mcpHttp([[ticket]], 0, { redirect: true });
  try {
    vi.stubEnv("PLICO_MCP_AUTH", "Bearer fixture-secret");
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
        headersEnv: { Authorization: "PLICO_MCP_AUTH" },
      },
    });
    await expect(discoverMcpTools(loaded)).rejects.toThrow(
      /docs.*connection or tool listing failed/,
    );
    expect(server.requests).toEqual([]);
  } finally {
    await server.close();
  }
});

it("cancels discovery in flight and still closes the HTTP session", async () => {
  const server = await mcpHttp([[ticket]], 1000);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    const controller = new AbortController();
    const pending = discoverMcpTools(loaded, { signal: controller.signal }).catch((error) => error);
    await vi.waitFor(() =>
      expect(server.requests.some((r) => r.method === "tools/list")).toBe(true),
    );
    controller.abort();
    expect(await pending).toMatchObject({ message: "MCP server docs: discovery cancelled." });
    expect(server.requests.at(-1)?.method).toBe("DELETE");
  } finally {
    await server.close();
  }
});
