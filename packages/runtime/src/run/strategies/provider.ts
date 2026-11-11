import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ProjectConfig } from "@plico-ai/contracts";
import { ARTIFACT_TOOL_NAMES, type Skill } from "@plico-ai/core";
import { RunCancelled, type RunContext } from "../../engine/index.js";
import { ModelProviderError, RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { approvalTimeoutMs, decideApproval } from "../../policy/approval.js";
import { createArtifactModelTools } from "../../tools/artifact-model-tools.js";
import { createSkillModelTool } from "../../tools/skill-model-tool.js";
import type { DeclaredTool, EventStore, ModelProvider, ModelRequest } from "../../types/index.js";
import { runToolStep } from "../tool-step.js";
import { nameToolStep } from "../tracing.js";
import { awaitApproval } from "./approval.js";
import { createToolRecovery } from "./tool-recovery.js";

export async function runProviderBackedRun(
  ctx: RunContext,
  provider: ModelProvider,
  message: string | undefined,
  instructions: string,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  eventStore: EventStore | undefined,
  model: ProjectConfig["model"],
  config: ProjectConfig,
  history: Array<Pick<import("../../types/index.js").ProviderMessage, "role" | "content">> = [],
  skills: Skill[] = [],
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

  const artifactTools = await createArtifactModelTools();
  const skillTools = skills.length > 0 ? [await createSkillModelTool(skills)] : [];
  const toolsByName = new Map(
    [...tools, ...artifactTools, ...skillTools].map((tool) => [tool.name, tool]),
  );
  const artifactAccess = config.artifacts?.access ?? "read-write";

  const providerTools = [...tools, ...artifactTools, ...skillTools]
    .filter((tool) => isArtifactToolAllowed(tool.name, artifactAccess))
    .map((tool) => ({
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
  const recover = createToolRecovery(events, messages);

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
        let providerMetadata: import("@plico-ai/contracts").JsonValue | undefined;
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
      if (!isArtifactToolAllowed(toolCall.name, artifactAccess)) {
        throw new RuntimeDiagnosticError({
          phase: "tool.access",
          toolName: toolCall.name,
          message: `Artifact tool ${toolCall.name} is disabled by artifacts.access="${artifactAccess}".`,
        });
      }
      await events.append("tool.call", {
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      });

      const tool = toolsByName.get(toolCall.name);
      if (!tool) {
        await recover.fromFailure(
          new RuntimeDiagnosticError({
            phase: "tool.validation",
            toolName: toolCall.name,
            message: `Provider requested unknown tool: ${toolCall.name}`,
          }),
          toolCall,
        );
        continue;
      }

      const parsedInput = await tool.parseInput(toolCall.arguments);
      if (!parsedInput.success) {
        await recover.fromFailure(
          new RuntimeDiagnosticError({
            phase: "tool.validation",
            toolName: tool.name,
            message: `Tool ${tool.name} arguments invalid: ${parsedInput.error}`,
          }),
          toolCall,
        );
        continue;
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
        await awaitApproval(ctx, requestId, tool.name, output, events, approvalTimeoutMs(config));
      }

      let result: unknown;
      try {
        const idempotencyKey = `${ctx.runId}:${turn}:${callIndex}`;
        nameToolStep(ctx, `tool:${turn}:${callIndex}`, tool.name);
        result = await runToolStep(
          ctx,
          events,
          eventStore,
          tool,
          parsedInput.value,
          `tool:${turn}:${callIndex}`,
          idempotencyKey,
        );
      } catch (error) {
        if (error instanceof RunCancelled) throw error;
        await recover.fromFailure(
          new RuntimeDiagnosticError({
            phase: "runtime",
            toolName: tool.name,
            message: error instanceof Error ? error.message : String(error),
          }),
          toolCall,
        );
        continue;
      }

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

function isArtifactToolAllowed(
  toolName: string,
  access: NonNullable<ProjectConfig["artifacts"]>["access"],
): boolean {
  if (!ARTIFACT_TOOL_NAMES.includes(toolName as (typeof ARTIFACT_TOOL_NAMES)[number])) return true;
  if (access === "off") return false;
  if (access === "read-only" && (toolName === "write_file" || toolName === "edit_file"))
    return false;
  return true;
}
