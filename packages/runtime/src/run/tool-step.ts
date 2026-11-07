import { encodeArtifactContent } from "../artifacts.js";
import type { RunContext } from "../engine/index.js";
import type { InMemoryEventLog } from "../events.js";
import type { DeclaredTool, EventStore, ToolArtifactContext } from "../types/index.js";
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
  let staged: ReturnType<typeof createStagedArtifactContext> | undefined;
  const workspaceId = threadId ? `${threadId}:workspace` : `${ctx.runId}:workspace`;
  const ensureStaged = async () => {
    if (staged) return staged;
    const threadHistory =
      threadId && eventStore?.getThreadRunEvents
        ? (await eventStore.getThreadRunEvents(threadId)).filter(
            (event) => event.runId !== ctx.runId,
          )
        : [];
    staged = createStagedArtifactContext(ctx.runId, threadId, [...threadHistory, ...events.all()]);
    return staged;
  };
  const artifacts: ToolArtifactContext = {
    async read(path) {
      return (await ensureStaged()).context.read(path);
    },
    async write(path, content, options) {
      return (await ensureStaged()).context.write(path, content, options);
    },
    async list() {
      return (await ensureStaged()).context.list();
    },
  };

  const recorded = await ctx.step(stepName, async ({ signal }): Promise<RecordedToolStep> => {
    const result = await tool.handler(input, {
      signal,
      idempotencyKey,
      artifacts,
    });
    return {
      result: normalizeToolResult(result),
      writes: staged?.writes() ?? [],
      createWorkspace: staged?.workspaceCreated() ?? false,
      workspaceId: staged?.workspaceId ?? workspaceId,
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

function normalizeToolResult(value: unknown): unknown {
  if (value instanceof Uint8Array) return encodeArtifactContent(value);
  if (Array.isArray(value)) return value.map(normalizeToolResult);
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeToolResult(entry)]),
    );
  return value;
}
