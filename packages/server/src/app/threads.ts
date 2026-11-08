import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Thread, ThreadArtifactWorkspace, ThreadMessage } from "@plico/contracts";
import { buildArtifactWorkspace, runProject, ThreadBusyError } from "@plico/runtime";
import { finishFailedThreadRun } from "../thread-failure.js";
import { PlicoError } from "./errors.js";
import type { Metadata } from "./metadata.js";
import { readMetadata } from "./metadata.js";
import type { AppDeps, SendMessageOptions } from "./types.js";

const maxTitleLength = 200;

function storeFor(deps: AppDeps) {
  if (!deps.threadStore)
    throw new PlicoError("threads.unavailable", "Thread storage is unavailable.");
  return deps.threadStore;
}

export async function requireThread(deps: AppDeps, threadId: string): Promise<Thread> {
  const thread = await storeFor(deps).getThread(threadId);
  if (!thread) throw new PlicoError("thread.not_found", `Unknown thread ID: ${threadId}`);
  return thread;
}

export async function createThread(
  deps: AppDeps,
  options: { metadata?: unknown } = {},
): Promise<Thread> {
  return storeFor(deps).createThread(readMetadata(options.metadata));
}

export function getThread(deps: AppDeps, threadId: string): Promise<Thread | undefined> {
  return storeFor(deps).getThread(threadId);
}

export async function listThreads(
  deps: AppDeps,
  filter: { metadata?: unknown } = {},
): Promise<Thread[]> {
  const metadata = readMetadata(filter.metadata);
  return storeFor(deps).listThreads(metadata === undefined ? {} : { metadata });
}

export async function renameThread(
  deps: AppDeps,
  threadId: string,
  title: unknown,
): Promise<Thread> {
  const thread = await requireThread(deps, threadId);
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (!trimmed || trimmed.length > maxTitleLength)
    throw new PlicoError(
      "thread.invalid_title",
      `Title must be a nonempty string of at most ${maxTitleLength} characters.`,
    );
  const renamed = await storeFor(deps).renameThread(thread.id, trimmed);
  if (!renamed) throw new PlicoError("thread.not_found", `Unknown thread ID: ${threadId}`);
  return renamed;
}

export async function threadMessages(deps: AppDeps, threadId: string): Promise<ThreadMessage[]> {
  const thread = await requireThread(deps, threadId);
  return storeFor(deps).getMessages(thread.id);
}

export async function threadWorkspace(
  deps: AppDeps,
  threadId: string,
): Promise<ThreadArtifactWorkspace> {
  const thread = await requireThread(deps, threadId);
  if (!deps.eventStore.getThreadRunEvents)
    throw new PlicoError("workspace.unavailable", "Thread workspace projection is unavailable.");
  const events = await deps.eventStore.getThreadRunEvents(thread.id);
  const workspace = buildArtifactWorkspace(thread.id, events);
  if (!workspace)
    throw new PlicoError("workspace.not_found", `No artifact workspace for thread: ${thread.id}`);
  const { runId: _runId, ...threadWorkspace } = workspace;
  return { ...threadWorkspace, threadId: thread.id };
}

/** Records a user message and, unless told not to, starts the run that answers it. */
export async function sendMessage(
  deps: AppDeps,
  threadId: string,
  content: unknown,
  options: SendMessageOptions = {},
): Promise<ThreadMessage> {
  const store = storeFor(deps);
  const thread = await requireThread(deps, threadId);
  if (typeof content !== "string" || !content.trim())
    throw new PlicoError("message.invalid", "Message content must be a nonempty string.");
  const startRun = options.startRun !== false;
  const context = readMetadata(options.context, "context");
  const { provider } = deps;
  if (startRun && !provider)
    throw new PlicoError(
      "provider.unavailable",
      "Configure a model provider before sending a message.",
    );
  if (
    startRun &&
    (!store.storageIdentity || store.storageIdentity !== deps.eventStore.storageIdentity)
  )
    throw new PlicoError(
      "threads.store_mismatch",
      "Thread and run stores must use the same database.",
    );
  const runId = startRun ? `run-${randomUUID()}` : undefined;
  const providerKey = deps.providerAccountKey ?? deps.providerRecoveryKey;
  let message: ThreadMessage | undefined;
  try {
    message = await store.addMessage(
      thread.id,
      content,
      runId,
      providerKey
        ? {
            providerKey,
            projectRoot: resolve(deps.projectRoot),
            ...(context === undefined ? {} : { context }),
          }
        : undefined,
    );
  } catch (error) {
    if (error instanceof ThreadBusyError) throw new PlicoError("thread.busy", error.message);
    throw error;
  }
  if (!message) throw new PlicoError("thread.not_found", `Unknown thread ID: ${thread.id}`);
  if (provider && runId) {
    const history = (await store.getMessages(thread.id)).filter((entry) => entry.id !== message.id);
    await startThreadRun(deps, {
      runId,
      threadId: thread.id,
      ...(thread.metadata === undefined ? {} : { metadata: thread.metadata }),
      ...(context === undefined ? {} : { context }),
      content,
      history: history.map(({ role, content }) => ({ role, content })),
    });
  }
  return message;
}

async function startThreadRun(
  deps: AppDeps,
  run: {
    runId: string;
    threadId: string;
    metadata?: Metadata;
    context?: Metadata;
    content: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<void> {
  let resolveStarted!: () => void;
  let rejectStarted!: (error: unknown) => void;
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  void runProject(deps.projectRoot, {
    runId: run.runId,
    threadId: run.threadId,
    ...(run.metadata === undefined ? {} : { metadata: run.metadata }),
    ...(run.context === undefined ? {} : { context: run.context }),
    message: run.content,
    history: run.history,
    ...(deps.provider ? { provider: deps.provider } : {}),
    eventStore: deps.eventStore,
    engine: deps.engine,
    ...(deps.providerRecoveryKey ? { providerRecoveryKey: deps.providerRecoveryKey } : {}),
    onStarted: resolveStarted,
  }).catch(async (error: unknown) => {
    try {
      await finishFailedThreadRun(
        run.runId,
        run.threadId,
        deps.projectRoot,
        deps.engine,
        deps.eventStore,
        error,
        run.metadata,
      );
    } catch (settleError) {
      console.error("Could not record failed thread run", settleError);
    } finally {
      rejectStarted(error);
    }
  });
  await started;
}
