import { createHash } from "node:crypto";
import type { ProjectConfig } from "@plico-ai/contracts";
import type { InMemoryEventLog } from "../events.js";
import type { DeclaredTool } from "../types/index.js";
import { fingerprintTools } from "./tool-fingerprint.js";

/**
 * Records the tools a run discovered with a hash of the tool code. A resumed run compares both, so
 * a changed handler or policy fails the run before a tool runs. Older records without the
 * composite fingerprint fail conservatively because their original policy cannot be verified.
 */
export async function recordTools(
  root: string,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  config?: ProjectConfig,
): Promise<void> {
  const localFingerprint = await fingerprintTools(root);
  const fingerprint = createHash("sha256")
    .update(localFingerprint)
    .update(
      stableJson({
        sources: config?.mcpServers,
        approvals: config?.approvals,
      }),
    )
    .digest("hex");
  await events.append("tools.discovered", {
    tools: tools.map((tool) => ({
      source: tool.source,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      capabilities: tool.capabilities,
      approval: tool.approval,
      ...(tool.mcp ? { mcp: { serverId: tool.mcp.serverId, toolName: tool.mcp.toolName } } : {}),
    })),
    fingerprint,
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
}
