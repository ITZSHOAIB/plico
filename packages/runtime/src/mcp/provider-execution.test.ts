import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type ModelProvider, runProject } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

it("offers normalized MCP tools to a provider and returns remote results through its conversation", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root, loaded } = await project({
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { tools: { mcp_desk__get_ticket: "none" } },
      })};`,
    );
    const provider: ModelProvider = {
      async *stream(request) {
        expect(request.tools).toContainEqual({
          name: "mcp_desk__get_ticket",
          description: ticket.description,
          inputSchema: ticket.inputSchema,
        });
        const result = request.messages.find((message) => message.role === "tool");
        if (result) {
          expect(JSON.parse(result.content)).toEqual({
            content: [{ type: "text", text: "Ticket 42" }],
          });
          yield { type: "text", text: "Found ticket 42." };
        } else {
          yield {
            type: "tool.call",
            call: { id: "c1", name: "mcp_desk__get_ticket", arguments: { id: "42" } },
          };
        }
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    expect(await runProject(root, { message: "Find ticket 42", provider })).toMatchObject({
      status: "completed",
      output: "Found ticket 42.",
    });
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});

it("continues a provider conversation with healthy tools when another MCP source is unavailable", async () => {
  const server = await mcpHttp([[ticket]]);
  try {
    const { root, loaded } = await project({
      unavailable: { transport: "stdio", command: "plico-missing-command", tools: ["read"] },
      desk: { transport: "streamable-http", url: server.url, tools: ["get_ticket"] },
    });
    await writeFile(
      join(root, "plico.config.ts"),
      `export default ${JSON.stringify({
        ...loaded.config,
        approvals: { tools: { mcp_desk__get_ticket: "none" } },
      })};`,
    );
    const result = await runProject(root, {
      message: "Find ticket 42",
      provider: {
        async *stream(request) {
          expect(request.tools?.some((tool) => tool.name === "mcp_unavailable__read")).toBe(false);
          if (request.messages.some((message) => message.role === "tool"))
            yield { type: "text", text: "Found ticket 42." };
          else
            yield {
              type: "tool.call",
              call: { id: "c1", name: "mcp_desk__get_ticket", arguments: { id: "42" } },
            };
          yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    expect(result).toMatchObject({ status: "completed", output: "Found ticket 42." });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "run.warning",
        payload: expect.objectContaining({
          serverId: "unavailable",
          message: expect.stringMatching(/ENOENT/),
        }),
      }),
    );
    expect(server.requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
  } finally {
    await server.close();
  }
});
