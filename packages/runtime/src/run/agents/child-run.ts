import type { JsonSchema, JsonValue, PlicoEvent } from "@plico-ai/contracts";
import {
  ProjectChangedError,
  RunCancelled,
  type RunContext,
  RunSuspended,
} from "../../engine/index.js";
import { errorMessage, RunWaitingError, runtimeErrorPayload } from "../../errors.js";
import { InMemoryEventLog } from "../../events.js";
import type { DryRunScriptStep } from "../../types/index.js";
import { startRunSpan } from "../tracing.js";
import { prefixContext } from "./prefix-context.js";
import { executeAgent } from "./run-agent.js";
import { observe, type RunTree, relayApprovals } from "./tree.js";

export interface ChildCall {
  /** The child's name under its parent: `d<turn>-<call>` for a delegation, `a<n>-<id>` in a workflow. */
  segment: string;
  agentId: string;
  task: string;
  script?: DryRunScriptStep[];
  outputSchema?: JsonSchema;
}

export type ChildOutcome =
  | { status: "completed"; output?: string; structuredOutput?: JsonValue }
  | { status: "failed"; error: string };

/**
 * Runs an agent as a child of `parent` inside the root's engine run. Its ID is the parent's plus
 * the segment, so replay reaches the same child. The parent's stream records `agent.called` and
 * `agent.returned`. A wait or a cancel stops the whole tree; a failure is returned to the caller.
 */
export async function runChild(
  parent: RunContext,
  tree: RunTree,
  parentEvents: InMemoryEventLog,
  call: ChildCall,
): Promise<ChildOutcome> {
  const runId = `${parent.runId}.${call.segment}`;
  const agent = tree.agents.get(call.agentId);
  if (!agent) return { status: "failed", error: `Unknown agent "${call.agentId}".` };
  const ctx = prefixContext(parent, runId, call.segment);
  const events = await InMemoryEventLog.open(runId, tree.options.eventStore);
  observe(tree, events);
  relayApprovals(events, parentEvents);

  await parentEvents.append("agent.called", { runId, agentId: agent.id, task: call.task });
  await events.append("run.started", {
    projectRoot: tree.input.displayRoot ?? tree.input.root,
    projectName: tree.project.config.name,
    ...(tree.input.metadata === undefined ? {} : { metadata: tree.input.metadata }),
    ...(tree.input.context === undefined ? {} : { context: tree.input.context }),
    agentId: agent.id,
    parentRunId: parent.runId,
    rootRunId: tree.rootRunId,
  });
  const returned = (payload: Omit<PlicoEvent<"agent.returned">["payload"], "runId" | "agentId">) =>
    parentEvents.append("agent.returned", { runId, agentId: agent.id, ...payload });

  const span = startRunSpan(runId);
  try {
    const output = await executeAgent(ctx, span, tree, agent, events, {
      message: call.task,
      ...(call.script === undefined ? {} : { script: call.script }),
      ...(call.outputSchema === undefined ? {} : { outputSchema: call.outputSchema }),
    });
    await events.append("run.completed", output);
    await returned({ status: "completed", ...output, usage: runUsage(events.all()) });
    return { status: "completed", ...output };
  } catch (error) {
    if (
      error instanceof RunWaitingError ||
      error instanceof RunSuspended ||
      error instanceof ProjectChangedError
    ) {
      tree.halted = error;
      throw error;
    }
    if (error instanceof RunCancelled || ctx.signal.aborted) {
      await events.append("run.cancelled", {});
      await returned({ status: "cancelled", usage: runUsage(events.all()) });
      tree.halted = error instanceof RunCancelled ? error : new RunCancelled();
      throw tree.halted;
    }
    await events.append("run.error", runtimeErrorPayload(error));
    await events.append("run.failed", { phase: "runtime" });
    const message = errorMessage(error);
    await returned({ status: "failed", usage: runUsage(events.all()), error: message });
    return { status: "failed", error: message };
  } finally {
    span.end();
  }
}

/** A run's own model usage plus what its children reported. Never summed across streams. */
export function runUsage(events: PlicoEvent[]): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const event of events)
    if (event.type === "model.response" || event.type === "agent.returned") {
      inputTokens += event.payload.usage.inputTokens;
      outputTokens += event.payload.usage.outputTokens;
    }
  return { inputTokens, outputTokens };
}
