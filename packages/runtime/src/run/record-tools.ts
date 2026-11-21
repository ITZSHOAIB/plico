import { createHash } from "node:crypto";
import type { ProjectConfig } from "@plico-ai/contracts";
import type { InMemoryEventLog } from "../events.js";
import type { DeclaredTool } from "../types/index.js";
import { fingerprintTools } from "./tool-fingerprint.js";

/**
 * Records the tools a run discovered with a hash of the tool code. A resumed run compares both, so
 * a changed handler fails the run before the tool runs. Runs recorded without a hash are compared
 * on their declarations only.
 */
export async function recordTools(
  root: string,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  config?: ProjectConfig,
): Promise<void> {
  const recorded = events.all().find((event) => event.type === "tools.discovered");
  const legacy =
    recorded?.type === "tools.discovered" && recorded.payload.fingerprint === undefined;
  const localFingerprint = await fingerprintTools(root);
  const fingerprint =
    Object.keys(config?.mcpServers ?? {}).length > 0
      ? createHash("sha256")
          .update(localFingerprint)
          .update(
            JSON.stringify({
              sources: config?.mcpServers,
              approvals: config?.approvals,
            }),
          )
          .digest("hex")
      : localFingerprint;
  await events.append("tools.discovered", {
    tools: tools.map((tool) => ({
      source: tool.source,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      capabilities: tool.capabilities,
      approval: tool.approval,
    })),
    ...(legacy ? {} : { fingerprint }),
  });
}
