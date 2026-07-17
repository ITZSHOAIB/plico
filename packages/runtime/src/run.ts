import { randomUUID } from "node:crypto";
import { type LoadedProject, validateProject } from "@plico/core";
import { RunBlockedError, RuntimeDiagnosticError, runtimeErrorPayload } from "./errors.js";
import { InMemoryEventLog } from "./events.js";
import { composeInstructions } from "./instructions.js";
import { validateJsonSchemaSubset } from "./schema.js";
import { discoverTools } from "./tools.js";
import type {
  DeclaredTool,
  DryRunScriptStep,
  EventStore,
  ModelProvider,
  ModelRequest,
  PersistedRun,
  RunProjectOptions,
  RunResult,
} from "./types.js";

export async function runProject(
  root: string,
  options: RunProjectOptions = {},
): Promise<RunResult> {
  const validation = await validateProject(root);
  const runId = options.runId ?? `run-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const events = new InMemoryEventLog(runId);

  if (!validation.ok || !validation.project) {
    events.append("run.error", {
      phase: "validation",
      issues: validation.errors,
    });
    events.append("run.failed", {
      phase: "validation",
      status: "failed",
    });

    const result: RunResult = {
      runId,
      status: "failed",
      events: events.all(),
      errors: validation.errors,
    };

    await persistRunIfRequested(options.eventStore, {
      runId,
      projectRoot: root,
      projectName: "",
      status: "failed",
      startedAt,
      endedAt: new Date().toISOString(),
      events: result.events,
    });

    return result;
  }

  events.append("run.started", {
    projectRoot: validation.project.root,
    projectName: validation.project.config.name,
  });

  try {
    const instructions = await composeInstructions(validation.project);
    events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const tools = await discoverTools(validation.project);
    events.append("tools.discovered", {
      tools: tools.map((tool) => ({
        source: tool.source,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        capabilities: tool.capabilities,
        approval: tool.approval,
      })),
    });

    const output =
      options.provider !== undefined
        ? await runProviderBackedRun(
            options.provider,
            options.message,
            validation.project,
            instructions.content,
            tools,
            events,
          )
        : options.script === undefined
          ? await runDefaultDryRun(validation.project, events)
          : await runScriptedDryRun(options.script, tools, events);
    events.append("run.completed", { status: "completed" });

    const result: RunResult = {
      runId,
      status: "completed",
      ...(output === undefined ? {} : { output }),
      events: events.all(),
    };

    await persistRunIfRequested(options.eventStore, {
      runId,
      projectRoot: validation.project.root,
      projectName: validation.project.config.name,
      status: "completed",
      startedAt,
      endedAt: new Date().toISOString(),
      ...(output === undefined ? {} : { output }),
      events: result.events,
    });

    return result;
  } catch (error) {
    if (error instanceof RunBlockedError) {
      const result: RunResult = {
        runId,
        status: "blocked",
        events: events.all(),
      };

      await persistRunIfRequested(options.eventStore, {
        runId,
        projectRoot: validation.project.root,
        projectName: validation.project.config.name,
        status: "blocked",
        startedAt,
        endedAt: new Date().toISOString(),
        events: result.events,
      });

      return result;
    }

    events.append("run.error", runtimeErrorPayload(error));
    events.append("run.failed", {
      phase: "runtime",
      status: "failed",
    });

    const result: RunResult = {
      runId,
      status: "failed",
      events: events.all(),
    };

    await persistRunIfRequested(options.eventStore, {
      runId,
      projectRoot: validation.project.root,
      projectName: validation.project.config.name,
      status: "failed",
      startedAt,
      endedAt: new Date().toISOString(),
      events: result.events,
    });

    return result;
  }
}

async function runProviderBackedRun(
  provider: ModelProvider,
  message: string | undefined,
  _project: LoadedProject,
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

  events.append("input.received", { content: message });

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

    events.append("model.request", {
      messages: modelRequest.messages,
      maxSteps: modelRequest.maxSteps,
      tools: providerTools,
    });

    const modelResponse = await provider.complete(modelRequest);

    events.append("model.response", {
      content: modelResponse.content,
      usage: modelResponse.usage,
      toolCalls: modelResponse.toolCalls,
    });

    if (modelResponse.toolCalls === undefined || modelResponse.toolCalls.length === 0) {
      const finalContent = modelResponse.content;
      if (finalContent) {
        events.append("assistant.output", { content: finalContent });
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

      events.append("tool.call", {
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
        events.append("approval.required", {
          toolName: tool.name,
          arguments: toolCall.arguments,
          approval: tool.approval,
        });
        events.append("run.blocked", {
          status: "blocked",
          toolName: tool.name,
        });
        throw new RunBlockedError();
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

      events.append("tool.result", {
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

async function runDefaultDryRun(project: LoadedProject, events: InMemoryEventLog): Promise<string> {
  const output = `Dry run complete for ${project.config.name}.`;
  events.append("assistant.output", { content: output });
  return output;
}

async function runScriptedDryRun(
  script: DryRunScriptStep[],
  tools: DeclaredTool[],
  events: InMemoryEventLog,
): Promise<string | undefined> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  let output: string | undefined;

  for (const step of script) {
    if (step.type === "assistant.output") {
      output = step.content;
      events.append("assistant.output", { content: step.content });
      continue;
    }

    if (step.type === "artifact.write") {
      const workspaceId = randomUUID();
      events.append("artifact.workspace.created", { workspaceId });

      for (const file of step.files) {
        events.append("artifact.file.written", {
          path: file.path,
          content: file.content,
          mimeType: file.mimeType ?? "text/plain",
        });
      }

      const snapshotId = randomUUID();
      events.append("artifact.snapshot.created", {
        snapshotId,
        fileCount: step.files.length,
      });

      output = `Artifact workspace ${workspaceId} created with ${step.files.length} files`;
      continue;
    }

    const tool = toolsByName.get(step.toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${step.toolName}`);
    }

    events.append("tool.call", {
      toolName: tool.name,
      arguments: step.arguments,
    });
    const validationError = validateJsonSchemaSubset(step.arguments, tool.inputSchema);
    if (validationError) {
      throw new RuntimeDiagnosticError({
        phase: "tool.validation",
        toolName: tool.name,
        message: `Tool ${tool.name} arguments invalid: ${validationError}`,
      });
    }

    if (tool.approval.required) {
      events.append("approval.required", {
        toolName: tool.name,
        arguments: step.arguments,
        approval: tool.approval,
      });
      events.append("run.blocked", {
        status: "blocked",
        toolName: tool.name,
      });
      throw new RunBlockedError();
    }

    const result = await tool.handler(step.arguments);
    events.append("tool.result", {
      toolName: tool.name,
      result,
    });
  }

  return output;
}

function persistRunIfRequested(
  eventStore: EventStore | undefined,
  run: PersistedRun,
): Promise<void> {
  if (!eventStore) {
    return Promise.resolve();
  }

  return eventStore.persistRun(run);
}
