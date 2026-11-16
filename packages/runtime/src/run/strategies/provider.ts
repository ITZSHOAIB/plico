import type { JsonSchema, ProjectConfig } from "@plico-ai/contracts";
import { ARTIFACT_TOOL_NAMES, type Skill } from "@plico-ai/core";
import { RunCancelled, type RunContext } from "../../engine/index.js";
import { RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { approvalTimeoutMs, decideApproval } from "../../policy/approval.js";
import { createArtifactModelTools } from "../../tools/artifact-model-tools.js";
import { createSkillModelTool } from "../../tools/skill-model-tool.js";
import type { DeclaredTool, EventStore, ModelProvider, ModelRequest } from "../../types/index.js";
import { requestModel } from "../model-step.js";
import { createStructuredOutput, type ProviderRunOutput } from "../structured-output.js";
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
  outputSchema?: JsonSchema,
): Promise<ProviderRunOutput> {
  const maxSteps = model?.maxSteps ?? 10;
  if (outputSchema !== undefined && tools.some((tool) => tool.name === "submit_result")) {
    throw new RuntimeDiagnosticError({
      phase: "output.validation",
      message: "Tool name submit_result is reserved when the agent declares an output schema.",
    });
  }
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
  // Native response formats commonly require an object at the root. The result tool wraps
  // other JSON values so primitives, arrays and boolean schemas work with every provider.
  const nativeOutput =
    provider.supportsStructuredOutput === true &&
    typeof outputSchema === "object" &&
    outputSchema.type === "object";
  const structured =
    outputSchema === undefined
      ? undefined
      : await createStructuredOutput(outputSchema, nativeOutput);
  providerTools.push(...(structured?.tools ?? []));

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
      ...(outputSchema !== undefined && nativeOutput ? { outputSchema } : {}),
    };

    const modelResponse = await requestModel(ctx, provider, modelRequest, events, turn, model);

    const action = await structured?.handle(modelResponse, messages, events, turn + 1 < maxSteps);
    if (action?.kind === "complete") return action.result;
    if (action?.kind === "repair") continue;

    if (modelResponse.toolCalls === undefined || modelResponse.toolCalls.length === 0) {
      const finalContent = modelResponse.content;
      if (finalContent) {
        await events.append("assistant.output", { content: finalContent });
        output = finalContent;
      }
      return { output: output ?? finalContent };
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
