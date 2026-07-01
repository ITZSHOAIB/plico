import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import { type LoadedProject, validateProject } from "@plico/core";
import {
  createSqliteEventStore,
  type DryRunScriptStep,
  type EventStore,
  runProject,
} from "@plico/runtime";

export interface CreatePlicoServerOptions {
  projectRoot: string;
  eventStore: EventStore;
}

export interface ServePlicoOptions {
  projectRoot: string;
  databasePath: string;
  host?: string;
  port?: number;
}

export interface PlicoServer {
  requestListener: RequestListener;
}

export async function createPlicoServer(options: CreatePlicoServerOptions): Promise<PlicoServer> {
  const projectRoot = options.projectRoot;
  const eventStore = options.eventStore;

  return {
    requestListener: (request, response) => {
      void handleRequest({ projectRoot, eventStore, request, response });
    },
  };
}

export async function servePlico(options: ServePlicoOptions): Promise<Server> {
  const eventStore = createSqliteEventStore({ databasePath: options.databasePath });
  const server = createServer(
    (
      await createPlicoServer({
        projectRoot: options.projectRoot,
        eventStore,
      })
    ).requestListener,
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => resolve());
  });

  return server;
}

interface HandleRequestOptions {
  projectRoot: string;
  eventStore: EventStore;
  request: IncomingMessage;
  response: ServerResponse;
}

async function handleRequest(options: HandleRequestOptions): Promise<void> {
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

    if (options.request.method === "GET" && url.pathname === "/v1/runs") {
      const runs = await options.eventStore.listRuns();
      sendJson(options.response, 200, runs);
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

async function loadProjectOrThrow(projectRoot: string): Promise<LoadedProject> {
  const validation = await validateProject(projectRoot);
  if (!validation.ok || !validation.project) {
    const message = validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new HttpError(400, "project.invalid", message || "Invalid project.");
  }

  return validation.project;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(request);

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error("Expected JSON object body.");
    }

    return parsed;
  } catch {
    throw new HttpError(400, "request.invalid_json", "Malformed JSON body.");
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function normalizeScript(value: unknown): DryRunScriptStep[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "request.invalid_body", "script must be an array.");
  }

  return value.map((step, index) => normalizeScriptStep(step, index));
}

function normalizeScriptStep(step: unknown, index: number): DryRunScriptStep {
  if (!isRecord(step) || typeof step.type !== "string") {
    throw new HttpError(
      400,
      "request.invalid_body",
      `script step ${index + 1} must include a type.`,
    );
  }

  if (step.type === "assistant.output") {
    if (typeof step.content !== "string") {
      throw new HttpError(
        400,
        "request.invalid_body",
        `script step ${index + 1} must include content.`,
      );
    }

    return {
      type: "assistant.output",
      content: step.content,
    };
  }

  if (step.type === "tool.call") {
    if (typeof step.toolName !== "string") {
      throw new HttpError(
        400,
        "request.invalid_body",
        `script step ${index + 1} must include a toolName.`,
      );
    }

    return {
      type: "tool.call",
      toolName: step.toolName,
      arguments: step.arguments,
    };
  }

  throw new HttpError(
    400,
    "request.invalid_body",
    `script step ${index + 1} has an unsupported type.`,
  );
}

function parseAfterCursor(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, "cursor.invalid", `Malformed cursor: ${value}`);
  }

  return parsed;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(response, statusCode, { error: { code, message } });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
