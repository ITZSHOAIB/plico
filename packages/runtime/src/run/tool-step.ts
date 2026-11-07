import type { RunContext } from "../engine/index.js";
import type { InMemoryEventLog } from "../events.js";
import type { DeclaredTool, EventStore } from "../types/index.js";
import {
  artifactWriteEventPayload,
  createStagedArtifactContext,
  type StagedArtifactWrite,
} from "./artifact-tool-context.js";

interface RecordedToolStep {
  result?: unknown;
  writes: StagedArtifactWrite[];
  createWorkspace: boolean;
  workspaceId: string;
}

export async function runToolStep(
  ctx: RunContext,
  events: InMemoryEventLog,
  eventStore: EventStore | undefined,
  tool: DeclaredTool,
  input: unknown,
  stepName: string,
  idempotencyKey: string,
): Promise<unknown> {
  const threadId = events.all().find((event) => event.type === "run.started")?.payload.threadId;
  const threadHistory =
    threadId && eventStore?.getThreadRunEvents
      ? (await eventStore.getThreadRunEvents(threadId)).filter((event) => event.runId !== ctx.runId)
      : [];
  const staged = createStagedArtifactContext(ctx.runId, threadId, [
    ...threadHistory,
    ...events.all(),
  ]);

  const recorded = await ctx.step(stepName, async ({ signal }): Promise<RecordedToolStep> => {
    const result = await tool.handler(input, {
      signal,
      idempotencyKey,
      artifacts: staged.context,
    });
    return {
      result,
      writes: staged.writes(),
      createWorkspace: staged.workspaceCreated(),
      workspaceId: staged.workspaceId,
    };
  });

  await events.append("tool.result", { toolName: tool.name, result: recorded.result });
  if (recorded.createWorkspace) {
    await events.append("artifact.workspace.created", { workspaceId: recorded.workspaceId });
  }
  for (const write of recorded.writes) {
    await events.append("artifact.file.written", artifactWriteEventPayload(write));
  }
  return recorded.result;
}
