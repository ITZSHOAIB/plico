import { createRequire } from "node:module";
import type { Client } from "@modelcontextprotocol/client";
import type { McpServerConfig } from "@plico-ai/contracts";
import { safeReason } from "./error-reason.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

/** Only Plico-authored diagnostics may bypass protocol error sanitization. */
export class McpSessionError extends Error {}

interface SessionOptions {
  root: string;
  serverId: string;
  source: McpServerConfig;
  operation: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

export async function withMcpClient<T>(
  options: SessionOptions,
  action: (client: Client, request: { signal: AbortSignal; timeout: number }) => Promise<T>,
): Promise<T> {
  const { root, serverId, source, operation, timeoutMs } = options;
  if (options.signal?.aborted) throw new Error(`MCP server ${serverId}: ${operation} cancelled.`);
  const [{ Client }, { createMcpTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("./transport.js"),
  ]);
  const client = new Client(
    { name: "plico", version },
    {
      versionNegotiation: { mode: "auto" },
      inputRequired: { autoFulfill: false },
    },
  );
  const deadline = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  let transportReason: string | undefined;
  const transport = createMcpTransport(root, serverId, source, {
    signal,
    timeoutMs,
    onReason(reason) {
      transportReason = reason;
    },
  });
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  let failure: unknown;
  let result: T | undefined;
  try {
    const request = { signal, timeout: timeoutMs };
    await client.connect(transport, request);
    result = await action(client, request);
  } catch (error) {
    const reason = safeReason(error) ?? transportReason;
    const status = options.signal?.aborted
      ? "cancelled"
      : deadline.signal.aborted
        ? "timed out"
        : `${operation === "discovery" ? "connection or tool listing failed" : "call failed"}${reason ? ` (${reason})` : ""}`;
    failure =
      error instanceof McpSessionError
        ? error
        : new Error(`MCP server ${serverId}: ${operation} ${status}.`);
  } finally {
    clearTimeout(timer);
    try {
      if ("terminateSession" in transport) await transport.terminateSession();
    } catch {
      failure ??= new Error(`MCP server ${serverId}: session cleanup failed.`);
    }
    try {
      await client.close();
    } catch {
      failure ??= new Error(`MCP server ${serverId}: client cleanup failed.`);
    }
  }
  if (failure !== undefined) throw failure;
  // A successful callback may itself return undefined; failures are tracked separately.
  return result as T;
}
