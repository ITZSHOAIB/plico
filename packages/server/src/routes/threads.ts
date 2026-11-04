import { readJsonBody } from "../body.js";
import { HttpError } from "../errors.js";
import { sendJson } from "../responses.js";
import type { Route, RouteContext } from "./types.js";

function storeFor(context: RouteContext) {
  if (!context.threadStore)
    throw new HttpError(503, "threads.unavailable", "Thread storage is unavailable.");
  return context.threadStore;
}

async function existing(context: RouteContext) {
  const store = storeFor(context);
  const id = context.params[0] ?? "";
  const thread = await store.getThread(id);
  if (!thread) throw new HttpError(404, "thread.not_found", `Unknown thread ID: ${id}`);
  return { store, thread };
}

export const threadRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/threads$/,
    handler: async (ctx) => sendJson(ctx.response, 201, await storeFor(ctx).createThread()),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads$/,
    handler: async (ctx) => sendJson(ctx.response, 200, await storeFor(ctx).listThreads()),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads\/([^/]+)$/,
    handler: async (ctx) => sendJson(ctx.response, 200, (await existing(ctx)).thread),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads\/([^/]+)\/messages$/,
    handler: async (ctx) => {
      const { store, thread } = await existing(ctx);
      sendJson(ctx.response, 200, await store.getMessages(thread.id));
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/threads\/([^/]+)\/messages$/,
    handler: async (ctx) => {
      const { store, thread } = await existing(ctx);
      const body = await readJsonBody(ctx.request);
      if (typeof body.content !== "string" || !body.content.trim())
        throw new HttpError(400, "message.invalid", "Message content must be a nonempty string.");
      const runId = ctx.provider ? `run-${randomUUID()}` : undefined;
      let message: Awaited<ReturnType<typeof store.addMessage>>;
      try {
        message = await store.addMessage(
          thread.id,
          body.content,
          runId,
          ctx.providerRecoveryKey
            ? { providerKey: ctx.providerRecoveryKey, projectRoot: resolve(ctx.projectRoot) }
            : undefined,
        );
      } catch (error) {
        if (error instanceof ThreadBusyError)
          throw new HttpError(409, "thread.busy", error.message);
        throw error;
      }
      if (!message) throw new HttpError(404, "thread.not_found", `Unknown thread ID: ${thread.id}`);
      if (ctx.provider && runId) {
        const history = (await store.getMessages(thread.id)).filter(
          (entry) => entry.id !== message.id,
        );
        let resolveStarted!: () => void;
        let rejectStarted!: (error: unknown) => void;
        const started = new Promise<void>((resolve, reject) => {
          resolveStarted = resolve;
          rejectStarted = reject;
        });
        void runProject(ctx.projectRoot, {
          runId,
          threadId: thread.id,
          message: body.content,
          history: history.map(({ role, content }) => ({ role, content })),
          provider: ctx.provider,
          eventStore: ctx.eventStore,
          ...(ctx.engine ? { engine: ctx.engine } : {}),
          ...(ctx.providerRecoveryKey ? { providerRecoveryKey: ctx.providerRecoveryKey } : {}),
          onStarted: resolveStarted,
        }).catch(rejectStarted);
        await started;
      }
      sendJson(ctx.response, 201, message);
    },
  },
];

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { runProject, ThreadBusyError } from "@plico/runtime";
