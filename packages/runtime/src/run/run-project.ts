import { randomUUID } from "node:crypto";
import { validateProject } from "@plico/core";
import { RunBlockedError, runtimeErrorPayload } from "../errors.js";
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
  const events = new InMemoryEventLog(runId);

  if (!validation.ok || !validation.project) {
    events.append("run.error", { phase: "validation", issues: validation.errors });
    events.append("run.failed", { phase: "validation", status: "failed" });

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

  events.append("run.started", {
    projectRoot: project.root,
    projectName: project.config.name,
  });

  try {
    const instructions = await composeInstructions(project);
    events.append("instructions.composed", {
      length: instructions.content.length,
      sources: instructions.sources,
      content: instructions.content,
    });

    const tools = await discoverTools(project);
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
            instructions.content,
            tools,
            events,
          )
        : options.script === undefined
          ? await runDefaultDryRun(project, events)
          : await runScriptedDryRun(options.script, tools, events);
    events.append("run.completed", { status: "completed" });

    return finalizeRun({ ...summary, status: "completed", output, events: events.all() });
  } catch (error) {
    if (error instanceof RunBlockedError) {
      return finalizeRun({ ...summary, status: "blocked", events: events.all() });
    }

    events.append("run.error", runtimeErrorPayload(error));
    events.append("run.failed", { phase: "runtime", status: "failed" });

    return finalizeRun({ ...summary, status: "failed", events: events.all() });
  }
}
