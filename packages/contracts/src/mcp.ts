/** A tool source. `tools` contains exact server tool names, never wildcard patterns. */
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

export interface McpStdioServerConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  /** Names of host environment variables to pass to the child process. */
  env?: string[];
  tools: string[];
}

export interface McpHttpServerConfig {
  transport: "streamable-http";
  url: string;
  /** Header name -> host environment variable containing the complete header value. */
  headersEnv?: Record<string, string>;
  tools: string[];
}
