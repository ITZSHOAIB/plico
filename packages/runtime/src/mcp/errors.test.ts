import { afterEach, expect, it, vi } from "vitest";
import { discoverMcpTools } from "../index.js";
import { mcpHttp } from "../testing/mcp-http.js";
import { project, ticket } from "../testing/mcp-project.js";

afterEach(() => vi.unstubAllEnvs());

it("reports HTTP 401 without including its response body or configured credentials", async () => {
  vi.stubEnv("PLICO_MCP_AUTH", "Bearer fixture-credential");
  const server = await mcpHttp([[ticket]], 0, {
    httpStatus: 401,
    errorBody: "private-response-body Bearer fixture-credential",
  });
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
        headersEnv: { Authorization: "PLICO_MCP_AUTH" },
      },
    });
    const error = await discoverMcpTools(loaded).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("401");
    expect(String(error)).not.toContain("private-response-body");
    expect(String(error)).not.toContain("fixture-credential");
  } finally {
    await server.close();
  }
});

it("reports an MCP error code without echoing the remote error message", async () => {
  const server = await mcpHttp([[ticket]], 0, {
    mcpError: { code: -32042, message: "private-error-with-credential" },
  });
  try {
    const { loaded } = await project({
      docs: {
        transport: "streamable-http",
        url: server.url,
        tools: ["get_ticket"],
      },
    });
    const error = await discoverMcpTools(loaded).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("MCP code -32042");
    expect(String(error)).not.toContain("private-error-with-credential");
  } finally {
    await server.close();
  }
});
