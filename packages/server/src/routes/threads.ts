import {
  createThread,
  listThreads,
  renameThread,
  requireThread,
  sendMessage,
  threadMessages,
  threadWorkspace,
} from "../app/threads.js";
import { readJsonBody } from "../body.js";
import { HttpError } from "../errors.js";
import { sendJson } from "../responses.js";
import type { Route } from "./types.js";

export const threadRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/threads$/,
    handler: async (ctx) => sendJson(ctx.response, 201, await createThread(ctx.app)),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads$/,
    handler: async (ctx) => sendJson(ctx.response, 200, await listThreads(ctx.app)),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads\/([^/]+)$/,
    handler: async (ctx) =>
      sendJson(ctx.response, 200, await requireThread(ctx.app, ctx.params[0] ?? "")),
  },
  {
    method: "PATCH",
    pattern: /^\/v1\/threads\/([^/]+)$/,
    handler: async (ctx) => {
      const threadId = ctx.params[0] ?? "";
      await requireThread(ctx.app, threadId);
      const { title } = await readJsonBody(ctx.request);
      sendJson(ctx.response, 200, await renameThread(ctx.app, threadId, title));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads\/([^/]+)\/workspace$/,
    handler: async (ctx) =>
      sendJson(ctx.response, 200, await threadWorkspace(ctx.app, ctx.params[0] ?? "")),
  },
  {
    method: "GET",
    pattern: /^\/v1\/threads\/([^/]+)\/messages$/,
    handler: async (ctx) =>
      sendJson(ctx.response, 200, await threadMessages(ctx.app, ctx.params[0] ?? "")),
  },
  {
    method: "POST",
    pattern: /^\/v1\/threads\/([^/]+)\/messages$/,
    handler: async (ctx) => {
      const threadId = ctx.params[0] ?? "";
      await requireThread(ctx.app, threadId);
      const body = await readJsonBody(ctx.request);
      if (body.startRun !== undefined && typeof body.startRun !== "boolean")
        throw new HttpError(400, "message.invalid", "startRun must be a boolean.");
      const message = await sendMessage(ctx.app, threadId, body.content, {
        startRun: body.startRun !== false,
      });
      sendJson(ctx.response, 201, message);
    },
  },
];
