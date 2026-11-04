import type { ProjectConfig } from "@plico/contracts";
import type { RunContext } from "../../engine/index.js";
import { RuntimeDiagnosticError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { approvalTimeoutMs, decideApproval } from "../../policy/approval.js";
import { validateJsonSchemaSubset } from "../../tools/schema.js";
import type { DeclaredTool, DryRunScriptStep } from "../../types/index.js";
import { nameToolStep } from "../tracing.js";
import { awaitApproval } from "./approval.js";

export async function runScriptedDryRun(
  ctx: RunContext,
  script: DryRunScriptStep[],
  tools: DeclaredTool[],
  events: InMemoryEventLog,
  config: ProjectConfig,
): Promise<string | undefined> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  let output: string | undefined;
  let workspaceId: string | undefined;
  const artifactPaths = new Set<string>();

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
        await events.append("artifact.file.written", {
          path: file.path,
          content: file.content,
          mimeType: file.mimeType ?? "text/plain",
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
      throw new Error(`Unknown tool: ${step.toolName}`);
    }

    await events.append("tool.call", {
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

    const idempotencyKey = `${ctx.runId}:${index}`;
    nameToolStep(ctx, `tool:${index}`, tool.name);
    const result = await ctx.step(`tool:${index}`, ({ signal }) =>
      tool.handler(step.arguments, { signal, idempotencyKey }),
    );
    await events.append("tool.result", {
      toolName: tool.name,
      result,
    });
  }

  return output;
}
