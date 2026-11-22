import type { JsonSchema, ToolDefinition } from "./tools.js";

/** A tool source. `tools` contains exact server tool names, never wildcard patterns. */
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

interface McpExecutionConfig {
  /** Deadline for a call's complete connect/list/call sequence; defaults to 30 seconds. */
  callTimeoutMs?: number;
  /** Exact allowlisted tool names whose interrupted calls may be repeated after a crash. */
  replayOnCrash?: string[];
}

export interface McpStdioServerConfig extends McpExecutionConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  /** Names of host environment variables to pass to the child process. */
  env?: string[];
  tools: string[];
}

export interface McpHttpServerConfig extends McpExecutionConfig {
  transport: "streamable-http";
  url: string;
  /** Header name -> host environment variable containing the complete header value. */
  headersEnv?: Record<string, string>;
  tools: string[];
}

/** Discovered metadata only: no handler, credentials or connection handles. */
export interface McpTool
  extends Pick<ToolDefinition, "name" | "description" | "capabilities" | "approval"> {
  serverId: string;
  toolName: string;
  source: string;
  inputSchema: JsonSchema;
}
