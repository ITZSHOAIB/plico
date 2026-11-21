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
