import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ProjectConfig } from "@plico/contracts";
import { RunCancelled, type RunContext } from "../../engine/index.js";
import { ModelProviderError, RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { decideApproval } from "../../policy/approval.js";
import { validateJsonSchemaSubset } from "../../tools/schema.js";
import type { DeclaredTool, ModelProvider, ModelRequest } from "../../types/index.js";
import { nameToolStep } from "../tracing.js";
import { awaitApproval } from "./approval.js";

export async function runProviderBackedRun(
  ctx: RunContext,
  provider: ModelProvider,
  message: string | undefined,
  instructions: string,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  model: ProjectConfig["model"],
  config: ProjectConfig,
  history: Array<Pick<import("../../types/index.js").ProviderMessage, "role" | "content">> = [],
): Promise<string> {
  const maxSteps = model?.maxSteps ?? 10;
  if (!message) {
    throw new RuntimeDiagnosticError({
      phase: "provider",
      message:
        "A user message is required when running with a provider. Provide --message or pipe input via stdin.",
    });
  }

  await events.append("input.received", { content: message });

  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  const providerTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  const messages: ModelRequest["messages"] = [
    { role: "system", content: instructions },
    ...(history ?? []),
    { role: "user", content: message },
  ];

  let output: string | undefined;

  for (let turn = 0; turn < maxSteps; turn++) {
    const modelRequest: ModelRequest = {
      messages,
      maxSteps,
      tools: providerTools,
    };

    await events.append("model.request", {
      ...(model ? { model: { provider: model.provider, name: model.name } } : {}),
      messages: modelRequest.messages,
      maxSteps: modelRequest.maxSteps,
      tools: providerTools,
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
        const toolCalls: NonNullable<import("../../types/index.js").ModelResponse["toolCalls"]> =
          [];
        let providerMetadata: import("@plico/contracts").JsonValue | undefined;
        let usage: import("../../types/index.js").ModelResponse["usage"] | undefined;
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

    if (modelResponse.toolCalls === undefined || modelResponse.toolCalls.length === 0) {
      const finalContent = modelResponse.content;
      if (finalContent) {
        await events.append("assistant.output", { content: finalContent });
        output = finalContent;
      }
      return output ?? finalContent;
    }

    messages.push({
      role: "assistant",
      content: modelResponse.content,
      toolCalls: modelResponse.toolCalls,
      ...(modelResponse.providerMetadata === undefined
        ? {}
        : { providerMetadata: modelResponse.providerMetadata }),
    });
    for (const [callIndex, toolCall] of modelResponse.toolCalls.entries()) {
      const tool = toolsByName.get(toolCall.name);
      if (!tool) {
        throw new RuntimeDiagnosticError({
          phase: "tool.validation",
          toolName: toolCall.name,
          message: `Provider requested unknown tool: ${toolCall.name}`,
        });
      }

      await events.append("tool.call", {
        toolName: tool.name,
        arguments: toolCall.arguments,
      });

      const validationError = validateJsonSchemaSubset(toolCall.arguments, tool.inputSchema);
      if (validationError) {
        throw new RuntimeDiagnosticError({
          phase: "tool.validation",
          toolName: tool.name,
          message: `Tool ${tool.name} arguments invalid: ${validationError}`,
        });
      }

      const approval = decideApproval(tool, config);
      if (approval.required) {
        const requestId = `${ctx.runId}:${turn}:${callIndex}`;
        await events.append("approval.requested", {
          requestId,
          toolName: tool.name,
          arguments: toolCall.arguments,
          approval,
        });
        await events.append("run.waiting", {
          requestId,
          toolName: tool.name,
          ...(output === undefined ? {} : { output }),
        });
        await awaitApproval(ctx, requestId, tool.name, output);
      }

      let result: unknown;
      try {
        const idempotencyKey = `${ctx.runId}:${turn}:${callIndex}`;
        nameToolStep(ctx, `tool:${turn}:${callIndex}`, tool.name);
        result = await ctx.step(`tool:${turn}:${callIndex}`, ({ signal }) =>
          tool.handler(toolCall.arguments, { signal, idempotencyKey }),
        );
      } catch (error) {
        if (error instanceof RunCancelled) throw error;
        throw new RuntimeDiagnosticError({
          phase: "runtime",
          toolName: tool.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      await events.append("tool.result", {
        toolName: tool.name,
        result,
      });

      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        toolName: tool.name,
        ...(toolCall.id === undefined ? {} : { toolCallId: toolCall.id }),
      });
    }
  }

  throw new RuntimeDiagnosticError({
    phase: "provider",
    message: `Maximum steps reached (${maxSteps}).`,
  });
}
