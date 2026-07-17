import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "@plico/core";
import { describe, expect, it } from "vitest";
import {
  checkReadiness,
  createSqliteEventStore,
  discoverTools,
  type ModelProvider,
  runProject,
} from "./index.js";
import { discoverMcpTools } from "./mcp.js";

const FAKE_MCP_SERVER = join(import.meta.dirname, "__fixtures__", "fake-mcp-server.mjs");

async function writeProjectWithMcp(
  root: string,
  mcpServers: Record<string, { command: string; args?: string[] }>,
) {
  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "artifacts"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });

  const mcpConfig = JSON.stringify(mcpServers, null, 2);
  await writeFile(
    join(root, "plico.config.ts"),
    [
      "export default {",
      "  schemaVersion: 1,",
      '  name: "MCP Test Agent",',
      `  mcpServers: ${mcpConfig},`,
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "agent.md"), "# MCP Test Agent\n\nAgent with MCP tools.\n", "utf8");

  return loadProject(root);
}

describe("MCP tool source", () => {
  describe("discovery", () => {
    it("discovers tools from a configured local MCP server", async () => {
      const tools = await discoverMcpTools({
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      expect(tools).toHaveLength(2);
      expect(tools[0]?.name).toBe("echo");
      expect(tools[0]?.description).toBe("Echoes the input back.");
      expect(tools[0]?.source).toBe("mcp:fake-server");
      expect(tools[0]?.inputSchema).toEqual({
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      });
      expect(tools[0]?.capabilities).toEqual([]);
      expect(tools[0]?.approval).toEqual({ required: false });

      expect(tools[1]?.name).toBe("add");
      expect(tools[1]?.source).toBe("mcp:fake-server");
    });

    it("normalizes MCP tool names to match Plico naming rules", async () => {
      const tools = await discoverMcpTools({
        "my-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      for (const tool of tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(tool.source).toMatch(/^mcp:/);
      }
    });

    it("returns empty array when no MCP servers are configured", async () => {
      const tools = await discoverMcpTools({});
      expect(tools).toEqual([]);
    });

    it("discovers tools from multiple MCP servers", async () => {
      const tools = await discoverMcpTools({
        "server-a": { command: "node", args: [FAKE_MCP_SERVER] },
        "server-b": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      expect(tools).toHaveLength(4);
      const serverASources = tools.filter((t) => t.source === "mcp:server-a");
      const serverBSources = tools.filter((t) => t.source === "mcp:server-b");
      expect(serverASources).toHaveLength(2);
      expect(serverBSources).toHaveLength(2);
    });

    it("exposes MCP tools through discoverTools when project has mcpServers config", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-"));
      const project = await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      const tools = await discoverTools(project);
      const mcpTools = tools.filter((t) => t.source.startsWith("mcp:"));
      const localTools = tools.filter((t) => t.source.startsWith("tools/"));

      expect(mcpTools).toHaveLength(2);
      expect(localTools).toHaveLength(0);
    });

    it("combines local TypeScript tools with MCP tools", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-"));
      await mkdir(join(root, "tools"), { recursive: true });
      await writeFile(
        join(root, "tools", "greet.tool.ts"),
        [
          "export default {",
          '  name: "greet",',
          '  description: "Greets a user.",',
          '  inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },',
          '  capabilities: ["greeting:write"],',
          "  approval: { required: false },",
          "  handler: async (input) => ({ greeting: 'Hello ' + (input).name + '!' }),",
          "} as const;",
          "",
        ].join("\n"),
        "utf8",
      );

      const project = await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      const tools = await discoverTools(project);
      const mcpTools = tools.filter((t) => t.source.startsWith("mcp:"));
      const localTools = tools.filter((t) => t.source.startsWith("tools/"));

      expect(mcpTools).toHaveLength(2);
      expect(localTools).toHaveLength(1);
      expect(tools).toHaveLength(3);
    });

    it("rejects invalid MCP server configuration", async () => {
      await expect(
        discoverMcpTools({
          "bad-server": { command: "nonexistent-binary-xyz" },
        }),
      ).rejects.toThrow();
    });
  });

  describe("handler execution", () => {
    it("calls an MCP tool and returns the result through the handler", async () => {
      const tools = await discoverMcpTools({
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      const echoTool = tools.find((t) => t.name === "echo");
      expect(echoTool).toBeDefined();
      if (!echoTool) return;

      const result = await echoTool.handler({ message: "hello world" });
      expect(result).toEqual({ content: [{ type: "text", text: "hello world" }] });
    });

    it("calls an MCP add tool and returns the sum", async () => {
      const tools = await discoverMcpTools({
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      const addTool = tools.find((t) => t.name === "add");
      expect(addTool).toBeDefined();
      if (!addTool) return;

      const result = await addTool.handler({ a: 3, b: 7 });
      expect(result).toEqual({ content: [{ type: "text", text: "10" }] });
    });
  });

  describe("provider-backed run integration", () => {
    it("a fake provider calls an MCP tool and receives the result", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-run-"));
      await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      let callCount = 0;
      const fakeProvider: ModelProvider = {
        complete: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: "",
              usage: { inputTokens: 10, outputTokens: 5 },
              toolCalls: [{ name: "echo", arguments: { message: "test-value" } }],
            };
          }
          return {
            content: "Done",
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        },
      };

      const result = await runProject(root, {
        provider: fakeProvider,
        message: "Echo test",
      });

      expect(result.status).toBe("completed");
      expect(result.output).toBe("Done");

      const toolCallEvents = result.events.filter((e) => e.type === "tool.call");
      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0]?.payload).toMatchObject({
        toolName: "echo",
        arguments: { message: "test-value" },
      });

      const toolResultEvents = result.events.filter((e) => e.type === "tool.result");
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]?.payload).toMatchObject({
        toolName: "echo",
        result: { content: [{ type: "text", text: "test-value" }] },
      });

      const sourceEvents = result.events.filter((e) => e.type === "tools.discovered");
      expect(sourceEvents).toHaveLength(1);
      const payload = sourceEvents[0]?.payload as Record<string, unknown>;
      const discoveredTools = payload.tools as Array<Record<string, unknown>>;
      const mcpTool = discoveredTools.find((t) => t.source === "mcp:fake-server");
      expect(mcpTool).toBeDefined();
      expect(mcpTool.name).toBe("echo");
    });

    it("centralized approval policy applies to MCP tools", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-policy-"));
      const mcpServers = {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      };
      const mcpConfig = JSON.stringify(mcpServers, null, 2);
      await mkdir(join(root, "skills"), { recursive: true });
      await mkdir(join(root, "tools"), { recursive: true });
      await mkdir(join(root, "evals"), { recursive: true });
      await mkdir(join(root, "artifacts"), { recursive: true });
      await mkdir(join(root, "memory"), { recursive: true });

      await writeFile(
        join(root, "plico.config.ts"),
        [
          "export default {",
          "  schemaVersion: 1,",
          '  name: "MCP Policy Agent",',
          `  mcpServers: ${mcpConfig},`,
          "  approvalPolicy: {",
          "    rules: [",
          "      { match: { tool: 'echo' }, decision: 'require_approval', reason: 'Echo needs approval' },",
          "    ],",
          "  },",
          "} as const;",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(join(root, "agent.md"), "# MCP Policy Agent\n", "utf8");

      let callCount = 0;
      const fakeProvider: ModelProvider = {
        complete: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: "",
              usage: { inputTokens: 10, outputTokens: 5 },
              toolCalls: [{ name: "echo", arguments: { message: "test" } }],
            };
          }
          return {
            content: "Done",
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        },
      };

      const result = await runProject(root, {
        provider: fakeProvider,
        message: "Echo test",
      });

      expect(result.status).toBe("blocked");
      const policyEvents = result.events.filter((e) => e.type === "policy.decision");
      expect(policyEvents).toHaveLength(1);
      expect(policyEvents[0]?.payload).toMatchObject({
        toolName: "echo",
        decision: "require_approval",
        reason: "Echo needs approval",
      });
    });

    it("MCP tool calls emit native events indistinguishable from local tool calls", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-events-"));
      await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      let callCount = 0;
      const fakeProvider: ModelProvider = {
        complete: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: "",
              usage: { inputTokens: 10, outputTokens: 5 },
              toolCalls: [{ name: "add", arguments: { a: 2, b: 3 } }],
            };
          }
          return {
            content: "Result is 5",
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        },
      };

      const result = await runProject(root, {
        provider: fakeProvider,
        message: "Add 2 and 3",
      });

      expect(result.status).toBe("completed");

      const eventTypes = result.events.map((e) => e.type);
      expect(eventTypes).toContain("tool.call");
      expect(eventTypes).toContain("policy.decision");
      expect(eventTypes).toContain("tool.result");

      const toolCallEvent = result.events.find((e) => e.type === "tool.call");
      expect(toolCallEvent?.payload).toHaveProperty("toolName");
      expect(toolCallEvent?.payload).toHaveProperty("arguments");

      const policyEvent = result.events.find((e) => e.type === "policy.decision");
      expect(policyEvent?.payload).toHaveProperty("decision");

      const toolResultEvent = result.events.find((e) => e.type === "tool.result");
      expect(toolResultEvent?.payload).toHaveProperty("result");
    });
  });

  describe("readiness", () => {
    it("reports ok for valid MCP configuration", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-ready-"));
      await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      const report = await checkReadiness(root);
      const mcpDiags = report.diagnostics.filter((d) => d.subsystem === "mcp.servers");
      expect(mcpDiags.length).toBeGreaterThan(0);

      const okDiag = mcpDiags.find((d) => d.severity === "ok" && d.message.includes("fake-server"));
      expect(okDiag).toBeDefined();
    });

    it("reports error for invalid MCP server command", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-bad-"));
      await writeProjectWithMcp(root, {
        "broken-server": { command: "nonexistent-binary-xyz" },
      });

      const report = await checkReadiness(root);
      const mcpDiags = report.diagnostics.filter((d) => d.subsystem === "mcp.servers");
      expect(mcpDiags.length).toBeGreaterThan(0);

      const errorDiag = mcpDiags.find(
        (d) => d.severity === "error" && d.message.includes("broken-server"),
      );
      expect(errorDiag).toBeDefined();
    });

    it("reports ok when no MCP servers are configured", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-none-"));
      await mkdir(join(root, "skills"), { recursive: true });
      await mkdir(join(root, "tools"), { recursive: true });
      await mkdir(join(root, "evals"), { recursive: true });
      await mkdir(join(root, "artifacts"), { recursive: true });
      await mkdir(join(root, "memory"), { recursive: true });

      await writeFile(
        join(root, "plico.config.ts"),
        [
          "export default {",
          "  schemaVersion: 1,",
          '  name: "No MCP Agent",',
          "} as const;",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(join(root, "agent.md"), "# No MCP Agent\n", "utf8");

      const report = await checkReadiness(root);
      const mcpDiags = report.diagnostics.filter((d) => d.subsystem === "mcp.servers");
      expect(mcpDiags).toHaveLength(1);
      expect(mcpDiags[0]).toMatchObject({
        severity: "ok",
        message: "No MCP servers configured",
      });
    });
  });

  describe("persistence", () => {
    it("persists MCP tool events through the event store", async () => {
      const root = await mkdtemp(join(tmpdir(), "plico-mcp-persist-"));
      const databasePath = join(await mkdtemp(join(tmpdir(), "plico-db-")), "plico.sqlite");
      const eventStore = createSqliteEventStore({ databasePath });
      await writeProjectWithMcp(root, {
        "fake-server": { command: "node", args: [FAKE_MCP_SERVER] },
      });

      let callCount = 0;
      const fakeProvider: ModelProvider = {
        complete: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              content: "",
              usage: { inputTokens: 10, outputTokens: 5 },
              toolCalls: [{ name: "echo", arguments: { message: "persisted" } }],
            };
          }
          return {
            content: "Done",
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        },
      };

      const result = await runProject(root, {
        provider: fakeProvider,
        message: "Echo persisted",
        eventStore,
      });

      expect(result.status).toBe("completed");

      const runs = await eventStore.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("completed");

      const events = await eventStore.getEvents(result.runId);
      const toolCallEvents = events.filter((e) => e.type === "tool.call");
      expect(toolCallEvents).toHaveLength(1);
    });
  });
});
