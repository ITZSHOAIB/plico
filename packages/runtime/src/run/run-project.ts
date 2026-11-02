import { randomUUID } from "node:crypto";
import { validateProject } from "@plico/core";
import { RunWaitingError, runtimeErrorPayload } from "../errors.js";
import { InMemoryEventLog } from "../events.js";
import { composeInstructions } from "../instructions.js";
import { discoverTools } from "../tools/index.js";
import type { RunProjectOptions, RunResult } from "../types/index.js";
import { finalizeRun } from "./finalize.js";
import { runDefaultDryRun } from "./strategies/default-dry.js";
import { runProviderBackedRun } from "./strategies/provider.js";
import { runScriptedDryRun } from "./strategies/scripted.js";

export async function runProject(
  root: string,
  options: RunProjectOptions = {},
): Promise<RunResult> {
  const validation = await validateProject(root);
  const runId = options.runId ?? `run-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const events = new InMemoryEventLog(runId, options.eventStore);
  await events.append("run.started", {
    projectRoot: validation.project?.root ?? root,
    projectName: validation.project?.config.name ?? "",
  });
  options.onStarted?.(runId);

  if (!validation.ok || !validation.project) {
    await events.append("run.error", { phase: "validation", issues: validation.errors });
    await events.append("run.failed", { phase: "validation" });

    return finalizeRun({
      runId,
      projectRoot: root,
      projectName: "",
      status: "failed",
      startedAt,
      events: events.all(),
      errors: validation.errors,
      eventStore: options.eventStore,
    });
  }

  const { project } = validation;
  const summary = {
    runId,
    projectRoot: project.root,
    projectName: project.config.name,
    startedAt,
    eventStore: options.eventStore,
  };

  try {
    const instructions = await composeInstructions(project);
    await events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const tools = await discoverTools(project);
    await events.append("tools.discovered", {
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
            instructions.content,
            tools,
            events,
          )
        : options.script === undefined
          ? await runDefaultDryRun(project, events)
          : await runScriptedDryRun(options.script, tools, events);
    await events.append("run.completed", {
      ...(output === undefined ? {} : { output }),
    });

    return await finalizeRun({ ...summary, status: "completed", output, events: events.all() });
  } catch (error) {
    if (error instanceof RunWaitingError) {
      return finalizeRun({ ...summary, status: "waiting", events: events.all() });
    }

    await events.append("run.error", runtimeErrorPayload(error));
    await events.append("run.failed", { phase: "runtime" });

    return finalizeRun({ ...summary, status: "failed", events: events.all() });
  }
}
