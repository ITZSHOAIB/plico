import type { LoadedProject } from "@plico-ai/core";
import { withMcpClient } from "../../mcp/session.js";
import type { ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

const PROBE_TIMEOUT_MS = 5_000;

/** Connects to each configured source and checks its exact tool allowlist. */
export async function checkMcpServers(project: LoadedProject): Promise<ReadinessDiagnostic[]> {
  const diagnostics: ReadinessDiagnostic[] = [];
  for (const [serverId, source] of Object.entries(project.config.mcpServers ?? {})) {
    const subsystem = `mcp.${serverId}`;
    try {
      const listed = await withMcpClient(
        {
          root: project.root,
          serverId,
          source,
          operation: "discovery",
          timeoutMs: PROBE_TIMEOUT_MS,
        },
        (client, request) => client.listTools(undefined, request),
      );
      const advertised = new Set(listed.tools.map((tool) => tool.name));
      const missing = source.tools.filter((name) => !advertised.has(name));
      diagnostics.push(
        missing.length === 0
          ? makeDiagnostic(
              "ok",
              subsystem,
              `MCP server ${serverId} is reachable and advertises ${source.tools.length} allowlisted tool(s).`,
              "plico.config.ts",
            )
          : makeDiagnostic(
              "error",
              subsystem,
              `MCP server ${serverId} does not advertise allowlisted tool(s): ${missing.join(", ")}.`,
              "plico.config.ts",
            ),
      );
    } catch (error) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          subsystem,
          error instanceof Error ? error.message : `MCP server ${serverId} is unreachable.`,
          "plico.config.ts",
        ),
      );
    }
  }
  return diagnostics;
}
