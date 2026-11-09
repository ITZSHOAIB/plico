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
): Promise<void> {
  const recorded = events.all().find((event) => event.type === "tools.discovered");
  const legacy =
    recorded?.type === "tools.discovered" && recorded.payload.fingerprint === undefined;
  await events.append("tools.discovered", {
    tools: tools.map((tool) => ({
      source: tool.source,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      capabilities: tool.capabilities,
      approval: tool.approval,
    })),
    ...(legacy ? {} : { fingerprint: await fingerprintTools(root) }),
  });
}
