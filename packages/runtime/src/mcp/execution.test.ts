import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("requires approval before calling an allowlisted MCP tool", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    expect(result.status).toBe("waiting");
    expect(result.events).toContainEqual(expect.objectContaining({ type: "approval.requested" }));
    expect(server.requests.filter((request) => request.method === "tools/call")).toEqual([]);
    expect(server.requests.some((request) => request.method === "DELETE")).toBe(true);
  } finally {
    await server.close();
  }
});

it("executes tools with JSON Schema 2020-12 input schemas", async () => {
  const server = await mcpHttp([
    [
      {
        ...ticket,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          $schema: "https://json-schema.org/draft/2020-12/schema",
        },
      },
    ],
  ]);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const result = await runProject(root, {
      script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
      ],
    });
    expect(result.status).toBe("completed");
  } finally {
    await server.close();
  }
});

it("runs a mocked MCP script without resolving credentials or connecting", async () => {
  const { root } = await project({
    desk: {
      transport: "stdio",
      command: "plico-missing-command",
      env: ["PLICO_MCP_UNSET_SECRET"],
      tools: ["get_ticket"],
    },
  });
  const result = await runProject(root, {
    mockTools: true,
    script: [
      {
        type: "tool.call",
        toolName: "mcp_desk__get_ticket",
        arguments: { id: "42" },
        result: "fixture",
      },
      { type: "approval.decide", approved: true },
    ],
  });
  expect(result.status).toBe("completed");
  expect(result.events).toContainEqual(
    expect.objectContaining({
      type: "tool.result",
      payload: { toolName: "mcp_desk__get_ticket", result: "fixture" },
    }),
  );
});

it("rejects an actual TypeScript/MCP name collision and identifies both sources", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "tools", "ticket.tool.ts"),
      `export default {
      name: "mcp_desk__get_ticket", description: "Local ticket", inputSchema: { type: "object" },
      capabilities: [], approval: { required: false }, handler: async () => "local"
    };`,
    );
    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.events)).toMatch(
      /Duplicate tool name.*tools\/ticket.tool.ts.*mcp:desk\/get_ticket/,
    );
    expect(server.requests.some((request) => request.method === "tools/call")).toBe(false);
  } finally {
    await server.close();
  }
});

it("allows only an explicit Plico per-tool override to waive MCP approval", async () => {
  const server = await mcpHttp([[{ ...ticket, annotations: { readOnlyHint: true } }]]);
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { default: "none", tools: { mcp_desk__get_ticket: "none" } },
      })};`,
    );
    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } }],
    });
    expect(result.status).toBe("completed");
    expect(result.events.some((event) => event.type === "approval.requested")).toBe(false);
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});

it("records the remote result after an approved MCP call", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    const result = await runProject(root, {
      script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
      ],
    });
    expect(result.status).toBe("completed");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "tool.result",
        payload: {
          toolName: "mcp_desk__get_ticket",
          result: { content: [{ type: "text", text: "Ticket 42" }] },
        },
      }),
    );
    expect(server.requests.filter((request) => request.method === "tools/call")).toMatchObject([
      { params: { name: "get_ticket", arguments: { id: "42" } } },
    ]);
  } finally {
    await server.close();
  }
});
