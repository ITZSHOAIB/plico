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
      options.script === undefined
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
