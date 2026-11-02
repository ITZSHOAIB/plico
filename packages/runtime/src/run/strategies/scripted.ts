import { randomUUID } from "node:crypto";
import { RuntimeDiagnosticError, RunWaitingError } from "../../errors.js";
import type { InMemoryEventLog } from "../../events.js";
import { validateJsonSchemaSubset } from "../../tools/schema.js";
import type { DeclaredTool, DryRunScriptStep } from "../../types/index.js";

export async function runScriptedDryRun(
  script: DryRunScriptStep[],
  tools: DeclaredTool[],
  events: InMemoryEventLog,
): Promise<string | undefined> {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  let output: string | undefined;
  let workspaceId: string | undefined;
  const artifactPaths = new Set<string>();

  for (const step of script) {
    if (step.type === "assistant.output") {
      output = step.content;
      await events.append("assistant.output", { content: step.content });
      continue;
    }

    if (step.type === "artifact.write") {
      if (workspaceId === undefined) {
        workspaceId = randomUUID();
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

      const snapshotId = randomUUID();
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

    if (tool.approval.required) {
      const requestId = randomUUID();
      await events.append("approval.requested", {
        requestId,
        toolName: tool.name,
        arguments: step.arguments,
        approval: tool.approval,
      });
      await events.append("run.waiting", {
        requestId,
        toolName: tool.name,
      });
      throw new RunWaitingError();
    }

    const result = await tool.handler(step.arguments);
    await events.append("tool.result", {
      toolName: tool.name,
      result,
    });
  }

  return output;
}
