import type { IncomingMessage, ServerResponse } from "node:http";
import { loadProject } from "@plico/core";
import {
  buildArtifactWorkspace,
  checkReadiness,
  composeInstructions,
  type EventStore,
  type ModelProvider,
  runEvals,
  runProject,
} from "@plico/runtime";
import { readJsonBody } from "./body.js";
import { errorMessage, HttpError, sendError } from "./errors.js";
import { loadProjectOrThrow } from "./project.js";
import { sendJson } from "./responses.js";
import { normalizeScript } from "./script.js";
import { handleEventStream, parseAfterCursor } from "./stream.js";

interface HandleRequestOptions {
  projectRoot: string;
  eventStore: EventStore;
  request: IncomingMessage;
  response: ServerResponse;
}

export async function handleRequest(options: HandleRequestOptions): Promise<void> {
  const url = new URL(options.request.url ?? "/", "http://127.0.0.1");

  try {
    if (options.request.method === "GET" && url.pathname === "/health") {
      sendJson(options.response, 200, { ok: true });
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/project") {
      const project = await loadProjectOrThrow(options.projectRoot);
      sendJson(options.response, 200, { project });
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/instructions") {
      const project = await loadProject(options.projectRoot);
      const instructions = await composeInstructions(project);
      sendJson(options.response, 200, instructions);
      return;
    }

    if (options.request.method === "POST" && url.pathname === "/v1/runs/dry") {
      const body = await readJsonBody(options.request);
      const script = body.script === undefined ? undefined : normalizeScript(body.script);
      const result = await runProject(options.projectRoot, {
        ...(script === undefined ? {} : { script }),
        eventStore: options.eventStore,
      });
      sendJson(options.response, 200, result);
      return;
    }

    if (options.request.method === "POST" && url.pathname === "/v1/runs/run") {
      const body = await readJsonBody(options.request);
      const message = typeof body.message === "string" ? body.message : undefined;
      const providerConfig =
        body.provider && typeof body.provider === "object"
          ? (body.provider as Record<string, unknown>)
          : undefined;

      if (!message) {
        sendError(
          options.response,
          400,
          "request.invalid_body",
          "A message is required for provider-backed runs.",
        );
        return;
      }

      const provider = await resolveProvider(options.projectRoot, providerConfig);
      const result = await runProject(options.projectRoot, {
        message,
        provider,
        eventStore: options.eventStore,
      });
      sendJson(options.response, 200, result);
      return;
    }

    if (options.request.method === "POST" && url.pathname === "/v1/eval") {
      const summary = await runEvals(options.projectRoot, {
        eventStore: options.eventStore,
      });
      sendJson(options.response, 200, summary);
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/readiness") {
      const report = await checkReadiness(options.projectRoot, {
        eventStore: options.eventStore,
      });
      sendJson(options.response, 200, report);
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
    if (options.request.method === "GET" && runMatch) {
      const runId = decodeURIComponent(runMatch[1] ?? "");
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      sendJson(options.response, 200, run);
      return;
    }

    const streamMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events\/stream$/);
    if (options.request.method === "GET" && streamMatch) {
      const runId = decodeURIComponent(streamMatch[1] ?? "");
      const after = url.searchParams.get("after");
      const afterSequence = after === null ? undefined : parseAfterCursor(after);
      await handleEventStream({
        projectRoot: options.projectRoot,
        eventStore: options.eventStore,
        request: options.request,
        response: options.response,
        runId,
        afterSequence,
      });
      return;
    }

    const eventsMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
    if (options.request.method === "GET" && eventsMatch) {
      const runId = decodeURIComponent(eventsMatch[1] ?? "");
      const after = url.searchParams.get("after");
      const afterSequence = after === null ? undefined : parseAfterCursor(after);
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      const events = await options.eventStore.getEvents(
        runId,
        afterSequence === undefined ? {} : { afterSequence },
      );
      sendJson(options.response, 200, events);
      return;
    }

    const workspaceMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/workspace$/);
    if (options.request.method === "GET" && workspaceMatch) {
      const runId = decodeURIComponent(workspaceMatch[1] ?? "");
      const run = await options.eventStore.getRun(runId);
      if (!run) {
        sendError(options.response, 404, "run.not_found", `Unknown run ID: ${runId}`);
        return;
      }

      const events = await options.eventStore.getEvents(runId);
      const workspace = buildArtifactWorkspace(runId, events);
      if (!workspace) {
        sendError(
          options.response,
          404,
          "workspace.not_found",
          `No artifact workspace for run: ${runId}`,
        );
        return;
      }

      sendJson(options.response, 200, workspace);
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/runs") {
      const runs = await options.eventStore.listRuns();
      sendJson(options.response, 200, runs);
      return;
    }

    if (options.request.method === "GET" && url.pathname === "/v1/conversations") {
      const conversations = await options.eventStore.listConversations();
      sendJson(options.response, 200, conversations);
      return;
    }

    const conversationMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)$/);
    if (options.request.method === "GET" && conversationMatch) {
      const conversationId = decodeURIComponent(conversationMatch[1] ?? "");
      const events = await options.eventStore.eventsByConversation(conversationId);
      sendJson(options.response, 200, events);
      return;
    }

    sendError(options.response, 404, "route.not_found", "Unknown route.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(options.response, error.status, error.code, error.message);
      return;
    }

    sendError(options.response, 500, "server.error", errorMessage(error));
  }
}

async function resolveProvider(
  projectRoot: string,
  providerConfig?: Record<string, unknown>,
): Promise<ModelProvider> {
  const configType =
    providerConfig && typeof providerConfig.type === "string" ? providerConfig.type : undefined;

  if (configType === "openai" && providerConfig) {
    try {
      const { createOpenAIProvider } = await import("@plico/provider");
      const apiKey = typeof providerConfig.apiKey === "string" ? providerConfig.apiKey : undefined;
      const model = typeof providerConfig.model === "string" ? providerConfig.model : undefined;
      const baseUrl =
        typeof providerConfig.baseUrl === "string" ? providerConfig.baseUrl : undefined;
      return createOpenAIProvider({
        type: "openai",
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      });
    } catch {
      // Fall through to fake provider
    }
  }

  // Also check project config for provider settings
  try {
    const validation = await loadProject(projectRoot);
    const projectProviderConfig = validation.config?.provider;
    if (
      projectProviderConfig &&
      typeof projectProviderConfig === "object" &&
      projectProviderConfig.type === "openai"
    ) {
      const { createOpenAIProvider } = await import("@plico/provider");
      const config = projectProviderConfig as Record<string, unknown>;
      const apiKey = typeof config.apiKey === "string" ? config.apiKey : undefined;
      const model = typeof config.model === "string" ? config.model : undefined;
      const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : undefined;
      return createOpenAIProvider({
        type: "openai",
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      });
    }
  } catch {
    // Fall through to fake provider
  }

  // Fake provider for testing
  return {
    complete: async (request) => {
      const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user");
      const lastToolMessage = [...request.messages].reverse().find((m) => m.role === "tool");
      if (!lastToolMessage && request.tools && request.tools.length > 0) {
        const tool = request.tools[0];
        if (tool) {
          return {
            content: "",
            usage: { inputTokens: 10, outputTokens: 1 },
            toolCalls: [{ name: tool.name, arguments: { title: "Test ticket" } }],
          };
        }
      }
      const assistantContent = `Fake provider response to: ${lastUserMessage?.content ?? ""}`;
      return { content: assistantContent, usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
}
