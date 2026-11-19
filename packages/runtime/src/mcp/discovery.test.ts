import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { discoverMcpTools } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, schema, serverFile, ticket } from "../testing/mcp-project.js";

afterEach(() => vi.unstubAllEnvs());

it("discovers only allowlisted stdio tools as Plico metadata and closes the server", async () => {
  const { root, loaded } = await project({
    tickets: {
      transport: "stdio",
      command: process.execPath,
      args: [serverFile],
      tools: ["get_ticket"],
    },
  });
  await writeFile(
    join(root, "mcp-fixture.json"),
    JSON.stringify({
      tools: [ticket, { ...ticket, name: "delete_all", annotations: { readOnlyHint: true } }],
    }),
  );
  expect(await discoverMcpTools(loaded)).toEqual([
    {
      serverId: "tickets",
      toolName: "get_ticket",
      source: "mcp:tickets/get_ticket",
      name: "mcp_tickets__get_ticket",
      description: "Read a ticket.",
      inputSchema: schema,
      capabilities: [],
      approval: { required: true },
    },
  ]);
  const observed = JSON.parse(await readFile(join(root, "mcp-process.json"), "utf8"));
  expect(observed.cwd.toLowerCase()).toBe(root.toLowerCase());
  expect(() => process.kill(observed.pid, 0)).toThrow();
});

it("discovers all HTTP pages with configured headers and terminates its session", async () => {
  vi.stubEnv("PLICO_MCP_AUTH", "Bearer fixture-secret");
  const server = await mcpHttp([
    [{ ...ticket, name: "not_allowed" }],
    [{ ...ticket, annotations: { readOnlyHint: true, destructiveHint: false } }],
  ]);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
        headersEnv: { Authorization: "PLICO_MCP_AUTH" },
      },
    });
    const tools = await discoverMcpTools(loaded);
    expect(tools).toMatchObject([{ name: "mcp_docs__get_ticket", approval: { required: true } }]);
    expect(JSON.stringify(tools)).not.toContain("fixture-secret");
    expect(server.requests.filter((r) => r.method === "tools/list")).toHaveLength(2);
    expect(server.requests.every((r) => r.headers.authorization === "Bearer fixture-secret")).toBe(
      true,
    );
    expect(server.requests.at(-1)?.method).toBe("DELETE");
    expect(server.requests.some((r) => r.method === "tools/call")).toBe(false);
  } finally {
    await server.close();
  }
});

it("rejects an unavailable allowlisted tool and still terminates the HTTP session", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["missing_tool"],
      },
    });
    await expect(discoverMcpTools(loaded)).rejects.toThrow(/docs.*missing_tool.*not advertised/);
    expect(server.requests.at(-1)?.method).toBe("DELETE");
  } finally {
    await server.close();
  }
});

it("normalizes remote tool names while preserving their exact identity", async () => {
  const server = await mcpHttp([[{ ...ticket, name: "Get-Ticket" }]]);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["Get-Ticket"],
      },
    });
    expect(await discoverMcpTools(loaded)).toMatchObject([
      {
        toolName: "Get-Ticket",
        source: "mcp:docs/Get-Ticket",
        name: "mcp_docs__get_ticket",
      },
    ]);
  } finally {
    await server.close();
  }
});

it("rejects ambiguous normalized names instead of silently replacing a tool", async () => {
  const server = await mcpHttp([[{ ...ticket, name: "get-ticket" }, ticket]]);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get-ticket", "get_ticket"],
      },
    });
    await expect(discoverMcpTools(loaded)).rejects.toThrow(
      /Duplicate MCP tool name.*mcp_docs__get_ticket/,
    );
    expect(server.requests.at(-1)?.method).toBe("DELETE");
  } finally {
    await server.close();
  }
});

it("rejects a server that advertises an allowlisted name more than once", async () => {
  const server = await mcpHttp([[ticket], [{ ...ticket, description: "Another tool" }]]);
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    await expect(discoverMcpTools(loaded)).rejects.toThrow(
      /docs.*get_ticket.*advertised more than once/,
    );
  } finally {
    await server.close();
  }
});

it("automatically negotiates modern servers without forcing the legacy handshake", async () => {
  const server = await mcpHttp([[ticket]], 0, { modern: true });
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    expect(await discoverMcpTools(loaded)).toMatchObject([{ name: "mcp_docs__get_ticket" }]);
    expect(server.requests.some((r) => r.method === "server/discover")).toBe(true);
    expect(server.requests.some((r) => r.method === "initialize")).toBe(false);
  } finally {
    await server.close();
  }
});
