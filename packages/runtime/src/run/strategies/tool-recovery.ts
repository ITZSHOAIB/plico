import type { RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import type { ModelRequest } from "../../types/index.js";

/** How many failed tool calls one run hands back to the model before it fails. */
export const MAX_TOOL_RECOVERIES = 2;

/**
 * A bad tool call (unknown tool, invalid arguments, throwing handler) is returned to the model as
 * `{ error }` so it can correct itself. Past the limit the original diagnostic fails the run.
 */
export function createToolRecovery(events: InMemoryEventLog, messages: ModelRequest["messages"]) {
  let recoveries = 0;
  return {
    async fromFailure(
      failure: RuntimeDiagnosticError,
      toolCall: { id?: string | undefined; name: string },
    ): Promise<void> {
      if (++recoveries > MAX_TOOL_RECOVERIES) throw failure;
      const result = { error: failure.message };
      await events.append("tool.result", { toolName: toolCall.name, result });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        toolName: toolCall.name,
        ...(toolCall.id === undefined ? {} : { toolCallId: toolCall.id }),
      });
    },
  };
}
