import { isAbsolute, resolve } from "node:path";
import { SpanStatusCode } from "@opentelemetry/api";
import { validateProject } from "@plico-ai/core";
import type { Engine, RecoveredRun, RunContext } from "../engine/index.js";
import { InMemoryEventLog } from "../events.js";
import type { RunProjectOptions, RunResult } from "../types/index.js";
import { finalizeRun } from "./finalize.js";
import type { RunInput } from "./run-input.js";
import { runLoop } from "./run-project.js";
import { startRunSpan } from "./tracing.js";

/**
 * Continues runs a dead process left running. The provider and event store come from this process;
 * the project path, message and script come from the journal.
 */
export async function recoverRuns(
  options: RunProjectOptions & {
    engine: Engine;
    recoveryFilter?: { projectRoot: string; providerRecoveryKey?: string; providerOnly?: boolean };
    onRecoveryStarted?: (runId: string) => void;
    onRecoverySettled?: (runId: string) => void;
  },
): Promise<RecoveredRun[]> {
  const recovered = await options.engine.recover<RunInput, RunResult>((_runId, input) => {
    const filter = options.recoveryFilter;
    if (
      filter &&
      (!isAbsolute(input.root) ||
        projectIdentity(input.root) !== projectIdentity(filter.projectRoot) ||
        (filter.providerOnly === true && input.message === undefined) ||
        (input.message !== undefined &&
          (!input.providerRecoveryKey ||
            !filter.providerRecoveryKey ||
            input.providerRecoveryKey !== filter.providerRecoveryKey)))
    )
      return undefined;
    const { provider: _provider, ...withoutProvider } = options;
    return async (ctx, journaled) => {
      const span = startRunSpan(ctx.runId, input.traceContext);
      options.onRecoveryStarted?.(ctx.runId);
      try {
        const result =
          input.message === undefined
            ? isLegacyScript(input)
              ? await failRecovery(ctx, journaled, options, "recovery", legacyScriptMessage)
              : await runLoop(ctx, journaled, withoutProvider, span)
            : options.provider === undefined
              ? await failRecovery(
                  ctx,
                  journaled,
                  options,
                  "provider",
                  "Cannot recover provider-backed run without a provider.",
                )
              : await runLoop(ctx, journaled, options, span);
        if (result.status === "failed") span.setStatus({ code: SpanStatusCode.ERROR });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
        options.onRecoverySettled?.(ctx.runId);
      }
    };
  });
  return recovered.map(({ runId, state, error, output }) => ({
    runId,
    state: output && output.status !== "running" ? output.status : state,
    ...(error === undefined ? {} : { error }),
  }));
}

function projectIdentity(root: string): string {
  const absolute = resolve(root);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

const legacyScriptMessage =
  "This scripted run was started by an older Plico that did not record whether its tools may run, so it is not resumed. Start it again.";

/**
 * A script journaled before runs recorded `mockTools`. It may have come from an API caller, so
 * resuming it could run handlers that caller should never reach; it fails instead.
 */
function isLegacyScript(input: RunInput): boolean {
  return input.script !== undefined && !("mockTools" in input);
}

async function failRecovery(
  ctx: RunContext,
  input: RunInput,
  options: RunProjectOptions,
  phase: string,
  message: string,
): Promise<RunResult> {
  const events = await InMemoryEventLog.open(ctx.runId, options.eventStore);
  const validation = await validateProject(input.root);
  if (events.all().length === 0) {
    await events.append("run.started", {
      projectRoot: input.displayRoot ?? input.root,
      projectName: validation.project?.config.name ?? "",
    });
    options.onStarted?.(ctx.runId);
  }
  events.continueAfterReplay();
  await events.append("run.error", { phase, message });
  await events.append("run.failed", { phase });
  return finalizeRun({
    runId: ctx.runId,
    projectRoot: input.displayRoot ?? input.root,
    projectName: validation.project?.config.name ?? "",
    status: "failed",
    startedAt: input.startedAt,
    events: events.all(),
    eventStore: options.eventStore,
  });
}
