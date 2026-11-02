import { randomUUID } from "node:crypto";
import { RuntimeDiagnosticError, RunWaitingError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { validateJsonSchemaSubset } from "../../tools/schema.js";
import type { DeclaredTool, ModelProvider, ModelRequest } from "../../types/index.js";

export async function runProviderBackedRun(
  provider: ModelProvider,
  message: string | undefined,
  instructions: string,
  tools: DeclaredTool[],
  events: InMemoryEventLog,
): Promise<string> {
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
    { role: "user", content: message },
  ];

  let output: string | undefined;

  for (let step = 0; step < 10; step++) {
    const modelRequest: ModelRequest = {
      messages,
      maxSteps: 10,
      tools: providerTools,
    };

    await events.append("model.request", {
      messages: modelRequest.messages,
      maxSteps: modelRequest.maxSteps,
      tools: providerTools,
    });

    const modelResponse = await provider.complete(modelRequest);

    await events.append("model.response", {
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

    for (const toolCall of modelResponse.toolCalls) {
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

      if (tool.approval.required) {
        const requestId = randomUUID();
        await events.append("approval.requested", {
          requestId,
          toolName: tool.name,
          arguments: toolCall.arguments,
          approval: tool.approval,
        });
        await events.append("run.waiting", {
          requestId,
          toolName: tool.name,
        });
        throw new RunWaitingError();
      }

      let result: unknown;
      try {
        result = await tool.handler(toolCall.arguments);
      } catch (error) {
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
        role: "assistant",
        content: modelResponse.content || "",
      });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        toolName: tool.name,
      });
    }
  }

  return output ?? "Maximum steps reached";
}
