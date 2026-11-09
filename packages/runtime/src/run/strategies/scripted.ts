import type { ProjectConfig } from "@plico-ai/contracts";
import { RunCancelled, type RunContext } from "../../engine/index.js";
import { RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { approvalTimeoutMs, decideApproval } from "../../policy/approval.js";
import type { DeclaredTool, DryRunScriptStep, EventStore } from "../../types/index.js";
import { runToolStep } from "../tool-step.js";
import { nameToolStep } from "../tracing.js";
import { awaitApproval } from "./approval.js";

export async function runScriptedDryRun(
  ctx: RunContext,
  script: DryRunScriptStep[],
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  eventStore: EventStore | undefined,
  config: ProjectConfig,
  mockTools = false,
): Promise<string | undefined> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  let output: string | undefined;
  let workspaceId: string | undefined;
  const artifactPaths = new Set<string>();
  const artifactVersions = new Map<string, number>();

  for (const [index, step] of script.entries()) {
    if (step.type === "assistant.output") {
      output = step.content;
      await events.append("assistant.output", { content: step.content });
      continue;
    }

    if (step.type === "artifact.write") {
      if (workspaceId === undefined) {
        workspaceId = `${ctx.runId}:workspace`;
        await events.append("artifact.workspace.created", { workspaceId });
      }

      for (const file of step.files) {
        artifactPaths.add(file.path);
        const version = (artifactVersions.get(file.path) ?? 0) + 1;
        artifactVersions.set(file.path, version);
        await events.append("artifact.file.written", {
          path: file.path,
          content: file.content,
          mimeType: file.mimeType ?? "text/plain",
          version,
        });
      }

      const snapshotId = `${ctx.runId}:snapshot:${index}`;
      await events.append("artifact.snapshot.created", {
        snapshotId,
        fileCount: artifactPaths.size,
      });

      output = `Artifact workspace ${workspaceId} created with ${step.files.length} files`;
      continue;
    }

    const tool = toolsByName.get(step.toolName);
    if (!tool) {
      throw new RuntimeDiagnosticError({
        phase: "tool.validation",
        toolName: step.toolName,
        message: `Unknown tool: ${step.toolName}`,
      });
    }

    await events.append("tool.call", {
      toolName: tool.name,
      arguments: step.arguments,
    });
    const parsedInput = await tool.parseInput(step.arguments);
    if (!parsedInput.success) {
      throw new RuntimeDiagnosticError({
        phase: "tool.validation",
        toolName: tool.name,
        message: `Tool ${tool.name} arguments invalid: ${parsedInput.error}`,
      });
    }

    const approval = decideApproval(tool, config);
    if (approval.required) {
      const requestId = `${ctx.runId}:${index}`;
      await events.append("approval.requested", {
        requestId,
        toolName: tool.name,
        arguments: step.arguments,
        approval,
      });
      await events.append("run.waiting", {
        requestId,
        toolName: tool.name,
        ...(output === undefined ? {} : { output }),
      });
      await awaitApproval(ctx, requestId, tool.name, output, events, approvalTimeoutMs(config));
    }

    if (mockTools && step.live !== true) {
      if (!("result" in step)) {
        throw new RuntimeDiagnosticError({
          phase: "tool.validation",
          toolName: tool.name,
          message: `Tool ${tool.name} has no mocked result. Add "result" to the step, or "live": true to run the real handler.`,
        });
      }
      await events.append("tool.result", { toolName: tool.name, result: step.result });
      continue;
    }

    const idempotencyKey = `${ctx.runId}:${index}`;
    nameToolStep(ctx, `tool:${index}`, tool.name);
    try {
      await runToolStep(
        ctx,
        events,
        eventStore,
        tool,
        parsedInput.value,
        `tool:${index}`,
        idempotencyKey,
      );
    } catch (error) {
      if (error instanceof RunCancelled) throw error;
      throw new RuntimeDiagnosticError({
        phase: "runtime",
        toolName: tool.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return output;
}
