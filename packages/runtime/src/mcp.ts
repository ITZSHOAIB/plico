import { type ChildProcess, spawn } from "node:child_process";
import type { McpServerConfig } from "@plico/core";
import type { DeclaredTool, JsonSchemaSubset } from "./types.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonSchemaSubset;
}

interface McpToolsListResult {
  tools: McpToolDefinition[];
}

interface McpToolCallResult {
  content: Array<{ type: string; text?: string }>;
}

class McpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  private buffer = "";

  constructor(
    private command: string,
    private args: string[],
    private env?: Record<string, string>,
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullEnv = { ...process.env, ...this.env };
      this.process = spawn(this.command, this.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: fullEnv,
      });

      this.process.on("error", reject);

      this.process.stdout?.on("data", (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      this.process.on("close", () => {
        for (const [, pending] of this.pending) {
          pending.reject(new Error("MCP server closed unexpectedly"));
        }
        this.pending.clear();
      });

      this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "plico", version: "1.0.0" },
      })
        .then(() => {
          this.sendNotification("notifications/initialized");
          resolve();
        })
        .catch(reject);
    });
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = (await this.sendRequest("tools/list", {})) as McpToolsListResult;
    return result.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpToolCallResult> {
    return (await this.sendRequest("tools/call", { name, arguments: args })) as McpToolCallResult;
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.process?.stdin?.write(`${JSON.stringify(request)}\n`);
    });
  }

  private sendNotification(method: string): void {
    const notification = { jsonrpc: "2.0", method };
    this.process?.stdin?.write(`${JSON.stringify(notification)}\n`);
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Not a JSON-RPC response, ignore
      }
    }
  }
}

function normalizeMcpToolName(name: string): string {
  let normalized = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!/^[a-z]/.test(normalized)) {
    normalized = `mcp_${normalized}`;
  }
  return normalized.toLowerCase();
}

function normalizeMcpTool(tool: McpToolDefinition, serverName: string): DeclaredTool {
  const name = normalizeMcpToolName(tool.name);
  const inputSchema: JsonSchemaSubset = tool.inputSchema ?? {
    type: "object",
    properties: {},
    additionalProperties: false,
  };

  return {
    source: `mcp:${serverName}`,
    name,
    description: tool.description ?? `MCP tool: ${tool.name}`,
    inputSchema,
    capabilities: [],
    approval: { required: false },
    handler: async (input: unknown) => {
      const client = await createMcpClient(serverName);
      try {
        return await client.callTool(tool.name, input);
      } finally {
        await client.close();
      }
    },
  };
}

const clientCache = new Map<string, McpClient>();

async function createMcpClient(serverName: string): Promise<McpClient> {
  const cached = clientCache.get(serverName);
  if (cached) return cached;
  throw new Error(`MCP server "${serverName}" is not connected`);
}

export async function discoverMcpTools(
  servers: Record<string, McpServerConfig>,
): Promise<DeclaredTool[]> {
  const allTools: DeclaredTool[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    const client = new McpClient(config.command, config.args ?? [], config.env);
    try {
      await client.connect();
      clientCache.set(serverName, client);
      const mcpTools = await client.listTools();
      for (const tool of mcpTools) {
        allTools.push(normalizeMcpTool(tool, serverName));
      }
    } catch (error) {
      await client.close();
      throw new Error(
        `Failed to connect to MCP server "${serverName}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return allTools;
}

export async function checkMcpServers(
  servers: Record<string, McpServerConfig> | undefined,
): Promise<Array<{ serverName: string; ok: boolean; error?: string }>> {
  if (!servers || Object.keys(servers).length === 0) {
    return [];
  }

  const results: Array<{ serverName: string; ok: boolean; error?: string }> = [];

  for (const [serverName, config] of Object.entries(servers)) {
    const client = new McpClient(config.command, config.args ?? [], config.env);
    try {
      await client.connect();
      await client.listTools();
      await client.close();
      results.push({ serverName, ok: true });
    } catch (error) {
      await client.close();
      results.push({
        serverName,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
