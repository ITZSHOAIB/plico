import { createRequire } from "node:module";
import type { LoadedProject, McpTool } from "@plico-ai/contracts";

import { safeReason } from "./error-reason.js";
import { toMcpTool } from "./normalize.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

export interface McpDiscoveryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Explicit discovery only. Agent runs do not call this function. */
export async function discoverMcpTools(
  project: LoadedProject,
  options: McpDiscoveryOptions = {},
): Promise<McpTool[]> {
  if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
    throw new Error("MCP discovery timeoutMs must be a positive 32-bit integer.");
  const sources = Object.entries(project.config.mcpServers ?? {});
  if (sources.length === 0) return [];
  const [{ Client }, { createMcpTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("./transport.js"),
  ]);
  const tools: McpTool[] = [];
  for (const [serverId, source] of sources) {
    if (options.signal?.aborted) throw new Error("MCP discovery cancelled.");
    const client = new Client(
      { name: "plico", version },
      {
        versionNegotiation: { mode: "auto" },
      },
    );
    const deadline = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline.signal])
      : deadline.signal;
    let transportReason: string | undefined;
    const transport = createMcpTransport(project.root, serverId, source, {
      signal,
      timeoutMs,
      onReason(reason) {
        transportReason = reason;
      },
    });
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    let failure: unknown;
    try {
      let advertised: Awaited<ReturnType<typeof client.listTools>>;
      try {
        await client.connect(transport, { signal, timeout: timeoutMs });
        advertised = await client.listTools(undefined, { signal, timeout: timeoutMs });
      } catch (error) {
        const reason = safeReason(error) ?? transportReason;
        throw new Error(
          `MCP server ${serverId}: discovery ${options.signal?.aborted ? "cancelled" : deadline.signal.aborted ? "timed out" : `connection or tool listing failed${reason ? ` (${reason})` : ""}`}.`,
        );
      }
      for (const name of source.tools) {
        const matches = advertised.tools.filter((tool) => tool.name === name);
        if (matches.length > 1)
          throw new Error(`MCP server ${serverId}: ${name} is advertised more than once.`);
        const tool = matches[0];
        if (!tool) throw new Error(`MCP server ${serverId}: ${name} is not advertised.`);
        const normalized = toMcpTool(serverId, tool);
        if (tools.some((tool) => tool.name === normalized.name))
          throw new Error(
            `Duplicate MCP tool name ${normalized.name}. Rename the source or narrow its allowlist.`,
          );
        tools.push(normalized);
      }
    } catch (error) {
      failure = error;
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
  }
  return tools;
}
