import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, validateProject } from "./index.js";

async function project(mcpServers: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-mcp-config-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(join(root, "agent.md"), "Help with internal operations.");
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "MCP", mcpServers: ${mcpServers} };`,
  );
  return root;
}

describe("MCP configuration", () => {
  it("loads both transports and explicit allowlists without connecting or resolving secrets", async () => {
    const servers = {
      tickets: {
        transport: "stdio",
        command: "not-an-installed-command",
        args: ["--stdio"],
        env: ["PLICO_MCP_TEST_TOKEN"],
        tools: ["get-ticket"],
      },
      docs: {
        transport: "streamable-http",
        url: "http://127.0.0.1:1/mcp",
        headersEnv: { Authorization: "PLICO_MCP_TEST_AUTH" },
        tools: ["search"],
      },
    };
    const root = await project(JSON.stringify(servers));

    expect((await loadProject(root)).config).toMatchObject({ mcpServers: servers });
    expect((await validateProject(root)).errors).toEqual([]);
  });

  it("rejects tool names with surrounding whitespace", async () => {
    const result = await validateProject(
      await project(
        JSON.stringify({
          docs: {
            transport: "stdio",
            command: "node",
            tools: [" search "],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toContain(
      "Expected mcpServers.docs.tools to be an explicit array of unique, non-empty tool names without wildcards",
    );
  });

  it.each([
    "Mcp-Session-Id",
    "Mcp-Protocol-Version",
    "Content-Type",
    "Accept",
    "Host",
    "Content-Length",
  ])("rejects transport-managed header %s regardless of casing", async (name) => {
    for (const header of [name, name.toLowerCase(), name.toUpperCase()]) {
      const result = await validateProject(
        await project(
          JSON.stringify({
            docs: {
              transport: "streamable-http",
              url: "https://example.com/mcp",
              tools: [],
              headersEnv: { [header]: "TOKEN" },
            },
          }),
        ),
      );
      expect(result.ok, header).toBe(false);
      expect(result.errors.map((issue) => issue.message)).toContain(
        "Expected mcpServers.docs.headersEnv to map unique HTTP header names to environment variable names",
      );
    }
  });

  it("isolates normalized MCP configuration from later validation loads", async () => {
    const root = await project(
      JSON.stringify({
        local: {
          transport: "stdio",
          command: "node",
          args: ["server.mjs"],
          env: ["TOKEN"],
          tools: ["lookup"],
        },
        docs: {
          transport: "streamable-http",
          url: "https://example.com/mcp",
          headersEnv: { Authorization: "TOKEN" },
          tools: ["search"],
        },
      }),
    );
    const first = await validateProject(root);
    expect(first.ok).toBe(true);
    const servers = first.project?.config.mcpServers;
    if (!servers) throw new Error("Missing MCP configuration");
    const local = servers.local;
    const docs = servers.docs;
    if (
      local?.transport !== "stdio" ||
      docs?.transport !== "streamable-http" ||
      !local.args ||
      !local.env ||
      !docs.headersEnv
    )
      throw new Error("Unexpected transport");
    local.command = "changed";
    local.args.push("changed");
    local.env.push("CHANGED");
    local.tools.push("changed");
    docs.headersEnv.Authorization = "CHANGED";
    docs.tools.push("changed");
    delete servers.docs;
    const second = await validateProject(root);
    expect(second.ok).toBe(true);
    expect(second.project?.config.mcpServers).toEqual({
      local: {
        transport: "stdio",
        command: "node",
        args: ["server.mjs"],
        env: ["TOKEN"],
        tools: ["lookup"],
      },
      docs: {
        transport: "streamable-http",
        url: "https://example.com/mcp",
        headersEnv: { Authorization: "TOKEN" },
        tools: ["search"],
      },
    });
  });

  it.each([undefined, "search", ["*"], [""], ["search", "search"], [12]])(
    "rejects a missing or invalid explicit allowlist: %j",
    async (tools) => {
      const root = await project(
        JSON.stringify({ docs: { transport: "stdio", command: "node", tools } }),
      );

      const result = await validateProject(root);

      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({
        path: "plico.config.ts",
        severity: "error",
        message: expect.stringContaining("mcpServers.docs.tools"),
      });
      await expect(loadProject(root)).rejects.toThrow("Invalid config");
    },
  );

  it.each([
    [null, "Expected mcpServers to be an object"],
    [[], "Expected mcpServers to be an object"],
    [{ docs: null }, "Expected mcpServers.docs to be an object"],
    [{ "Bad Name": { transport: "stdio", command: "node", tools: [] } }, "mcpServers.Bad Name"],
    [{ docs: { transport: "sse", tools: [] } }, "mcpServers.docs.transport"],
    [{ docs: { command: "node", tools: [] } }, "mcpServers.docs.transport"],
    [{ docs: { transport: "stdio", command: "", tools: [] } }, "mcpServers.docs.command"],
    [{ docs: { transport: "stdio", command: 3, tools: [] } }, "mcpServers.docs.command"],
    [
      { docs: { transport: "stdio", command: "node", args: [3], tools: [] } },
      "mcpServers.docs.args",
    ],
    [
      { docs: { transport: "stdio", command: "node", env: { TOKEN: "secret" }, tools: [] } },
      "mcpServers.docs.env",
    ],
    [
      { docs: { transport: "stdio", command: "node", env: ["bad-name"], tools: [] } },
      "mcpServers.docs.env",
    ],
    [
      { docs: { transport: "stdio", command: "node", env: ["TOKEN", "TOKEN"], tools: [] } },
      "mcpServers.docs.env",
    ],
    [
      { docs: { transport: "stdio", command: "node", url: "http://localhost", tools: [] } },
      "mcpServers.docs.url",
    ],
    [{ docs: { transport: "streamable-http", tools: [] } }, "mcpServers.docs.url"],
    [
      { docs: { transport: "streamable-http", url: "relative/mcp", tools: [] } },
      "mcpServers.docs.url",
    ],
    [
      { docs: { transport: "streamable-http", url: "file:///mcp", tools: [] } },
      "mcpServers.docs.url",
    ],
    [
      {
        docs: {
          transport: "streamable-http",
          url: "https://user:secret@example.com/mcp",
          tools: [],
        },
      },
      "mcpServers.docs.url",
    ],
    [
      {
        docs: { transport: "streamable-http", url: "https://example.com/mcp#fragment", tools: [] },
      },
      "mcpServers.docs.url",
    ],
    [
      {
        docs: {
          transport: "streamable-http",
          url: "https://example.com/mcp",
          headersEnv: { Authorization: "Bearer secret" },
          tools: [],
        },
      },
      "mcpServers.docs.headersEnv",
    ],
    [
      {
        docs: {
          transport: "streamable-http",
          url: "https://example.com/mcp",
          headersEnv: { "Bad Header": "TOKEN" },
          tools: [],
        },
      },
      "mcpServers.docs.headersEnv",
    ],
    [
      {
        docs: {
          transport: "streamable-http",
          url: "https://example.com/mcp",
          headersEnv: { Authorization: "TOKEN", authorization: "TOKEN" },
          tools: [],
        },
      },
      "mcpServers.docs.headersEnv",
    ],
    [
      {
        docs: {
          transport: "streamable-http",
          url: "https://example.com/mcp",
          command: "node",
          tools: [],
        },
      },
      "mcpServers.docs.command",
    ],
    [
      { docs: { transport: "stdio", command: "node", tools: [], approval: "none" } },
      "mcpServers.docs.approval",
    ],
  ])("rejects invalid source configuration %j", async (servers, field) => {
    const result = await validateProject(await project(JSON.stringify(servers)));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      path: "plico.config.ts",
      severity: "error",
      message: field.startsWith("Expected ") ? field : expect.stringContaining(field),
    });
    expect(JSON.stringify(result.errors)).not.toContain("secret");
  });

  it.each([
    {},
    { docs: { transport: "stdio", command: "node", tools: [] } },
    { docs: { transport: "streamable-http", url: "https://example.com/mcp", tools: ["search"] } },
  ])("accepts configuration without optional fields %j", async (servers) => {
    const result = await validateProject(await project(JSON.stringify(servers)));

    expect(result.errors).toEqual([]);
    expect(result.project?.config.mcpServers).toEqual(servers);
  });
});
