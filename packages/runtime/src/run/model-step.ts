import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { JsonValue, ProjectConfig } from "@plico-ai/contracts";
import { RunCancelled, type RunContext } from "../engine/index.js";
import { ModelProviderError } from "../errors.js";
import type { InMemoryEventLog } from "../events.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../types/index.js";

/** Executes and journals one streamed model turn; replay does not call the provider again. */
export async function requestModel(
  ctx: RunContext,
  provider: ModelProvider,
  modelRequest: ModelRequest,
  events: InMemoryEventLog,
  turn: number,
  model: ProjectConfig["model"],
): Promise<ModelResponse & { attemptId: string }> {
  await events.append("model.request", {
    ...(model ? { model: { provider: model.provider, name: model.name } } : {}),
    messages: modelRequest.messages,
    maxSteps: modelRequest.maxSteps,
    tools: modelRequest.tools ?? [],
    ...(modelRequest.outputSchema === undefined ? {} : { outputSchema: modelRequest.outputSchema }),
  });

  const modelResponse = await ctx.step(
    `model:${turn}`,
    async ({ signal, attempt }) => {
      events.skipModelDeltas(turn);
      if (attempt > 0)
        await delay((model?.retryDelayMs ?? 100) * 2 ** (attempt - 1), undefined, { signal });
      const attemptId = randomUUID();
      await events.append("model.attempt", { turn, attemptId });
      let content = "";
      const toolCalls: NonNullable<ModelResponse["toolCalls"]> = [];
      let providerMetadata: JsonValue | undefined;
      let usage: ModelResponse["usage"] | undefined;
      for await (const chunk of provider.stream(modelRequest, { signal })) {
        if (chunk.type === "text") {
          content += chunk.text;
          await events.append("model.delta", { turn, attemptId, text: chunk.text });
        } else if (chunk.type === "tool.call") toolCalls.push(chunk.call);
        else {
          usage = chunk.usage;
          providerMetadata = chunk.providerMetadata;
        }
      }
      if (signal.aborted) throw new RunCancelled();
      if (!usage) throw new Error("Model stream ended without a finish.");
      return {
        content,
        usage,
        attemptId,
        ...(providerMetadata === undefined ? {} : { providerMetadata }),
        ...(toolCalls.length ? { toolCalls } : {}),
      };
    },
    {
      retries: model?.retries ?? 2,
      shouldRetry: (error) => error instanceof ModelProviderError && error.retryable,
    },
  );
  events.skipModelDeltas(turn);

  await events.append("model.response", {
    attemptId: modelResponse.attemptId,
    ...(modelResponse.providerMetadata === undefined
      ? {}
      : { providerMetadata: modelResponse.providerMetadata }),
    content: modelResponse.content,
    usage: modelResponse.usage,
    toolCalls: modelResponse.toolCalls,
  });

  return modelResponse;
}
