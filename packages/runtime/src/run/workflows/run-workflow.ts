import type { JsonSchema, JsonValue, RunResult, WorkflowAgentCall } from "@plico-ai/contracts";
import { normalizeInputSchema, readTargetSchemas, readWorkflow } from "@plico-ai/core";
import type { RunContext } from "../../engine/index.js";
import { RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import type { DryRunScriptStep } from "../../types/index.js";
import { runChild } from "../agents/child-run.js";
import type { RunTree } from "../agents/tree.js";

/**
 * Runs `workflows/<id>.ts` as the root of the tree. `agent()` runs a child run and `step()` a
 * journaled side effect, both numbered in call order, so the same code replays the same path.
 */
export async function runWorkflow(
  ctx: RunContext,
  tree: RunTree,
  id: string,
  events: InMemoryEventLog,
): Promise<Pick<RunResult, "output" | "structuredOutput">> {
  const workflow = await readWorkflow(tree.project, id);
  const schemas = await readTargetSchemas(tree.project, { kind: "workflow", id });
  const input = tree.input.input ?? tree.input.message;
  await events.append("input.received", {
    content: typeof input === "string" ? input : JSON.stringify(input ?? null),
  });
  if (schemas.input) {
    const parsed = await schemas.input.parse(input);
    if (!parsed.success)
      throw new RuntimeDiagnosticError({
        phase: "input.validation",
        message: `Workflow input is invalid: ${parsed.error}`,
      });
  }

  const script = tree.input.script?.filter(
    (step): step is Extract<DryRunScriptStep, { type: "agent.call" }> => step.type === "agent.call",
  );
  const guard = () => {
    if (tree.halted !== undefined) throw tree.halted;
  };
  let calls = 0;
  let steps = 0;
  // Replay matches journal entries by call order, so a second call in flight breaks it.
  let busy: string | undefined;
  const oneAtATime = async <R>(label: string, fn: () => Promise<R>): Promise<R> => {
    if (busy !== undefined)
      throw new RuntimeDiagnosticError({
        phase: "workflow",
        message: `${label} started while ${busy} was still running. agent() and step() calls run one at a time; await each before the next.`,
      });
    busy = label;
    try {
      return await fn();
    } finally {
      busy = undefined;
    }
  };

  const agent = (agentId: string, call: WorkflowAgentCall): Promise<unknown> =>
    oneAtATime(`agent("${agentId}")`, async () => {
      guard();
      const index = calls++;
      if (index >= workflow.maxAgentCalls)
        throw new RuntimeDiagnosticError({
          phase: "workflow",
          message: `Agent call budget reached: ${id} may call agents ${workflow.maxAgentCalls} times per run.`,
        });
      const scripted = script?.[index];
      if (script && scripted?.agentId !== agentId)
        throw new RuntimeDiagnosticError({
          phase: "workflow",
          message: `Workflow script step ${index + 1} must be an agent.call for "${agentId}".`,
        });
      const output =
        call.output === undefined
          ? undefined
          : await normalizeInputSchema(
              call.output,
              `${id} agent("${agentId}") output`,
              workflow.file,
            );
      const outcome = await runChild(ctx, tree, events, {
        segment: `a${index}-${agentId}`,
        agentId,
        task: call.task,
        ...(scripted ? { script: scripted.script } : {}),
        ...(output ? { outputSchema: output.jsonSchema as JsonSchema } : {}),
      });
      guard();
      if (outcome.status === "failed")
        throw new RuntimeDiagnosticError({
          phase: "workflow",
          message: `Agent ${agentId} failed: ${outcome.error}`,
        });
      if (!output) return outcome.output ?? "";
      const parsed = await output.parse(outcome.structuredOutput);
      if (!parsed.success)
        throw new RuntimeDiagnosticError({
          phase: "output.validation",
          message: `Agent ${agentId} returned an invalid result: ${parsed.error}`,
        });
      return outcome.structuredOutput;
    });

  const step = <T>(name: string, fn: () => T | Promise<T>): Promise<T> =>
    oneAtATime(`step("${name}")`, async () => {
      guard();
      const index = steps++;
      await events.append("workflow.step", { name });
      return ctx.step(`step:${index}:${name}`, () => fn());
    });

  const result = await workflow.definition.run({ input, agent, step });
  guard();
  if (schemas.output) {
    const parsed = await schemas.output.parse(result);
    if (!parsed.success)
      throw new RuntimeDiagnosticError({
        phase: "output.validation",
        message: `Workflow result is invalid: ${parsed.error}`,
      });
    return { output: JSON.stringify(result), structuredOutput: result as JsonValue };
  }
  if (result === undefined) return { output: "" };
  return { output: typeof result === "string" ? result : JSON.stringify(result) };
}
