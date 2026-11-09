import type { JsonValue } from "@plico-ai/contracts";
import type { RunContext } from "../../engine/index.js";
import { RunSuspended } from "../../engine/index.js";
import { RuntimeDiagnosticError, RunWaitingError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";

/** The decision a person sends for an approval. Only an explicit `approved: true` lets the tool run. */
interface ApprovalDecision {
  approved?: boolean;
  context?: Record<string, JsonValue>;
}

export function approvalWaitName(requestId: string): string {
  return `approval:${requestId}`;
}

/**
 * Holds the run on its approval wait. The first time there is no decision it stops the loop with
 * RunWaitingError so the caller can report the run as waiting. After a decision it returns when the
 * tool may run and fails the run for a denial or a timeout, with a different message for each.
 */
export async function awaitApproval(
  ctx: RunContext,
  requestId: string,
  toolName: string,
  output: string | undefined,
  events: InMemoryEventLog,
  timeoutMs?: number,
): Promise<void> {
  let outcome: Awaited<ReturnType<typeof ctx.wait<ApprovalDecision | null>>>;
  try {
    outcome = await ctx.wait<ApprovalDecision | null>(approvalWaitName(requestId), {
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  } catch (error) {
    if (error instanceof RunSuspended) throw new RunWaitingError(output);
    throw error;
  }

  if (outcome.kind === "timeout") {
    throw new RuntimeDiagnosticError({
      phase: "approval",
      toolName,
      message: `Approval for ${toolName} timed out.`,
    });
  }
  await events.append("approval.decided", {
    requestId,
    approved: outcome.value?.approved === true,
    ...(outcome.value?.context === undefined ? {} : { context: outcome.value.context }),
  });
  if (outcome.value?.approved !== true) {
    throw new RuntimeDiagnosticError({
      phase: "approval",
      toolName,
      message: `Approval for ${toolName} was denied.`,
    });
  }
}
