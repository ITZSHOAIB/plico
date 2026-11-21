import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpServerConfig } from "@plico-ai/contracts";
import { safeReason } from "./error-reason.js";

interface TransportOptions {
  signal: AbortSignal;
  timeoutMs: number;
  onReason(reason: string): void;
}

export function createMcpTransport(
  root: string,
  serverId: string,
  source: McpServerConfig,
  { signal, timeoutMs, onReason }: TransportOptions,
): StdioClientTransport | StreamableHTTPClientTransport {
  const environment = (variable: string): string => {
    const value = process.env[variable];
    if (value === undefined)
      throw new Error(`MCP server ${serverId}: missing environment variable ${variable}.`);
    return value;
  };
  const transport =
    source.transport === "stdio"
      ? new StdioClientTransport({
          command: source.command,
          args: source.args ?? [],
          cwd: root,
          stderr: "ignore",
          env: Object.fromEntries((source.env ?? []).map((name) => [name, environment(name)])),
        })
      : new StreamableHTTPClientTransport(new URL(source.url), {
          requestInit: {
            redirect: "error",
            headers: Object.fromEntries(
              Object.entries(source.headersEnv ?? {}).map(([name, variable]) => [
                name,
                environment(variable),
              ]),
            ),
          },
          fetch: async (input, init) => {
            const deadline =
              init?.method === "DELETE" ? AbortSignal.timeout(Math.min(timeoutMs, 1000)) : signal;
            const response = await fetch(input, {
              ...init,
              signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
            });
            if (init?.method === "POST" && !response.ok) onReason(`HTTP ${response.status}`);
            return response;
          },
        });
  // Negotiation can replace a spawn error with CONNECTION_CLOSED; retain only its safe code.
  transport.onerror = (error) => {
    const reason = safeReason(error);
    if (reason) onReason(reason);
  };
  return transport;
}
