import {
  context,
  createTraceState,
  ROOT_CONTEXT,
  type Span,
  type SpanContext,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { RunContext } from "../engine/index.js";

const getTracer = () => trace.getTracer("@plico/runtime");
const toolNames = new WeakMap<RunContext, Map<string, string>>();

export type StoredSpanContext = Pick<SpanContext, "traceId" | "spanId" | "traceFlags"> & {
  traceState?: string;
};

export function storeSpanContext(span: Span): StoredSpanContext {
  const { traceId, spanId, traceFlags, traceState } = span.spanContext();
  return {
    traceId,
    spanId,
    traceFlags,
    ...(traceState ? { traceState: traceState.serialize() } : {}),
  };
}

export function nameToolStep(ctx: RunContext, step: string, tool: string): void {
  toolNames.get(ctx)?.set(step, tool);
}

export function startRunSpan(runId: string, stored?: StoredSpanContext): Span {
  const previous = stored && {
    traceId: stored.traceId,
    spanId: stored.spanId,
    traceFlags: stored.traceFlags,
    ...(typeof stored.traceState === "string"
      ? { traceState: createTraceState(stored.traceState) }
      : {}),
  };
  return getTracer().startSpan("plico.run", {
    attributes: { "plico.run.id": runId },
    ...(previous && trace.isSpanContextValid(previous) ? { links: [{ context: previous }] } : {}),
  });
}

export function tracedContext(
  ctx: RunContext,
  runSpan: Span,
  model?: { name: string; provider: string },
): RunContext {
  const names = new Map<string, string>();
  const wrapped: RunContext = {
    get runId() {
      return ctx.runId;
    },
    get signal() {
      return ctx.signal;
    },
    wait: (name, options) => ctx.wait(name, options),
    step: (name, fn, options) => {
      const step = getTracer().startSpan(
        "plico.step",
        { attributes: { "plico.step.name": name } },
        trace.setSpan(ROOT_CONTEXT, runSpan),
      );
      return ctx
        .step(
          name,
          async (attempt) => {
            const tool = names.get(name);
            const modelCall = name.startsWith("model:");
            const child = getTracer().startSpan(
              modelCall
                ? `chat ${model?.name ?? "model"}`
                : tool
                  ? `execute_tool ${tool}`
                  : "plico.attempt",
              {
                attributes: {
                  "plico.step.attempt": attempt.attempt,
                  ...(tool
                    ? { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": tool }
                    : {}),
                  ...(modelCall
                    ? {
                        "gen_ai.operation.name": "chat",
                        ...(model
                          ? {
                              "gen_ai.request.model": model.name,
                              "gen_ai.provider.name": model.provider,
                            }
                          : {}),
                      }
                    : {}),
                },
              },
              trace.setSpan(ROOT_CONTEXT, step),
            );
            try {
              return await context.with(trace.setSpan(context.active(), child), () => fn(attempt));
            } catch (error) {
              child.setStatus({ code: SpanStatusCode.ERROR });
              throw error;
            } finally {
              child.end();
            }
          },
          options,
        )
        .then(
          (value) => {
            step.end();
            return value;
          },
          (error: unknown) => {
            step.setStatus({ code: SpanStatusCode.ERROR });
            step.end();
            throw error;
          },
        );
    },
  };
  toolNames.set(wrapped, names);
  return wrapped;
}
