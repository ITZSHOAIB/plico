import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("does not expose an HTTP cleanup body in run errors", async () => {
  const server = await mcpHttp([[ticket]], 0, { deleteAfterCallError: "secret-from-server-body" });
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
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.events)).not.toContain("secret-from-server-body");
    expect(JSON.stringify(result.events)).toContain("MCP server desk: session cleanup failed");
  } finally {
    await server.close();
  }
});

it("identifies both remote sources when their normalized names collide", async () => {
  const server = await mcpHttp([
    [
      { ...ticket, name: "b__x" },
      { ...ticket, name: "x" },
    ],
  ]);
  try {
    const { root } = await project({
      a: { transport: "streamable-http", url: server.url, tools: ["b__x"] },
      a__b: { transport: "streamable-http", url: server.url, tools: ["x"] },
    });
    const result = await runProject(root, {
      script: [{ type: "tool.call", toolName: "mcp_a__b__x", arguments: { id: "42" } }],
    });
    expect(result.status).toBe("failed");
    const errors = result.events.filter((event) => event.type === "run.error");
    expect(JSON.stringify(errors)).toContain("mcp:a/b__x");
    expect(JSON.stringify(errors)).toContain("mcp:a__b/x");
    expect(server.requests.some((request) => request.method === "tools/call")).toBe(false);
  } finally {
    await server.close();
  }
});

it("reports a protocol code without exposing server text and never automatically retries", async () => {
  const server = await mcpHttp([[ticket]], 0, {
    modern: true,
    callError: { code: -32020, message: "secret protocol details" },
  });
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
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.events)).toContain("MCP code -32020");
    expect(JSON.stringify(result.events)).not.toContain("secret protocol details");
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});
