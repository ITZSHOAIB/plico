import { expect, it } from "vitest";
import { runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("uses a server's callTimeoutMs and closes a timed-out call's session", async () => {
  const server = await mcpHttp([[ticket]], 0, { hangCall: true });
  try {
    const { root } = await project({
      desk: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
        callTimeoutMs: 500,
      },
    });
    const result = await runProject(root, {
      script: [
        { type: "tool.call", toolName: "mcp_desk__get_ticket", arguments: { id: "42" } },
        { type: "approval.decide", approved: true },
      ],
    });
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.events)).toContain("timed out");
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
    expect(server.requests.filter((request) => request.method === "DELETE")).toHaveLength(2);
  } finally {
    await server.close();
  }
});
