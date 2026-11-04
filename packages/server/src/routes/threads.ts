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
      const message = await store.addMessage(thread.id, body.content);
      if (!message) throw new HttpError(404, "thread.not_found", `Unknown thread ID: ${thread.id}`);
      sendJson(ctx.response, 201, message);
    },
  },
];
