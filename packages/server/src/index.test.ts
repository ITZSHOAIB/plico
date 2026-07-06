import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlicoServer, servePlico } from "./index.js";

interface SSEMessage {
  event?: string;
  id?: string;
  data?: string;
  comment?: string;
}

async function readSSEStream(
  baseUrl: string,
  path: string,
  signal: AbortSignal,
): Promise<SSEMessage[]> {
  const response = await fetch(`${baseUrl}${path}`, { signal });
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = "";
  const messages: SSEMessage[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;
      const msg = parseSSEMessage(part);
      if (msg) messages.push(msg);
    }
  }

  return messages;
}

function parseSSEMessage(text: string): SSEMessage | null {
  const lines = text.split("\n");
  const msg: SSEMessage = {};

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      msg.event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      msg.data = line.slice(6);
    } else if (line.startsWith("id: ")) {
      msg.id = line.slice(4);
    } else if (line.startsWith(": ")) {
      msg.comment = line.slice(2);
    }
  }

  return Object.keys(msg).length > 0 ? msg : null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function writeValidProject(root: string) {
  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "artifacts"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    [
      "export default {",
      "  schemaVersion: 1,",
      '  name: "Internal Ops Agent",',
      "} as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "agent.md"),
    [
      "# Internal Ops Agent",
      "",
      "Use the local Markdown instructions as the source of truth.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function startTestServer(listener: RequestListener) {
  const server = createServer(listener);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected the test server to listen on an IP socket.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function jsonRequest(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ body: unknown; status: number }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("createPlicoServer", () => {
  it("serves health and project metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const health = await jsonRequest(baseUrl, "/health");
    const project = await jsonRequest(baseUrl, "/v1/project");

    expect(health).toEqual({ status: 200, body: { ok: true } });
    expect(project).toMatchObject({
      status: 200,
      body: {
        project: {
          root,
          configPath: join(root, "plico.config.ts"),
          config: {
            schemaVersion: 1,
            name: "Internal Ops Agent",
          },
        },
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("persists a dry run and replays runs and events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "tools", "create-ticket.tool.ts"),
      [
        "export default {",
        '  name: "create_ticket",',
        '  description: "Create a ticket.",',
        '  inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false },',
        '  capabilities: ["ticket:write"],',
        "  approval: { required: false },",
        '  handler: async (input) => ({ ticketId: "TCK-" + input.title.length }),',
        "} as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const run = await jsonRequest(baseUrl, "/v1/runs/dry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: [
          { type: "assistant.output", content: "I will create the ticket." },
          { type: "tool.call", toolName: "create_ticket", arguments: { title: "VPN down" } },
        ],
      }),
    });

    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({
      status: "completed",
      output: "I will create the ticket.",
      events: expect.arrayContaining([expect.objectContaining({ type: "run.completed" })]),
    });

    const runId = String((run.body as { runId: string }).runId);

    const runs = await jsonRequest(baseUrl, "/v1/runs");
    expect(runs.status).toBe(200);
    expect(runs.body).toEqual([
      expect.objectContaining({
        runId,
        projectRoot: root,
        status: "completed",
      }),
    ]);

    const runDetail = await jsonRequest(baseUrl, `/v1/runs/${runId}`);
    expect(runDetail.status).toBe(200);
    expect(runDetail.body).toEqual(
      expect.objectContaining({
        runId,
        status: "completed",
      }),
    );

    const events = await jsonRequest(baseUrl, `/v1/runs/${runId}/events`);
    expect(events.status).toBe(200);
    expect(events.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 1, type: "run.started" }),
        expect.objectContaining({ sequence: 7, type: "run.completed" }),
      ]),
    );

    const replay = await jsonRequest(baseUrl, `/v1/runs/${runId}/events?after=3`);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual([
      expect.objectContaining({ sequence: 4, type: "assistant.output" }),
      expect.objectContaining({ sequence: 5, type: "tool.call" }),
      expect.objectContaining({ sequence: 6, type: "tool.result" }),
      expect.objectContaining({ sequence: 7, type: "run.completed" }),
    ]);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns consistent JSON errors for malformed JSON, unknown run IDs, invalid cursors, and unknown routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const malformed = await fetch(`${baseUrl}/v1/runs/dry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const unknownRun = await jsonRequest(baseUrl, "/v1/runs/run-missing");
    const invalidCursor = await jsonRequest(baseUrl, "/v1/runs/run-missing/events?after=nope");
    const notFound = await jsonRequest(baseUrl, "/nope");

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: {
        code: "request.invalid_json",
        message: "Malformed JSON body.",
      },
    });
    expect(unknownRun).toEqual({
      status: 404,
      body: {
        error: {
          code: "run.not_found",
          message: "Unknown run ID: run-missing",
        },
      },
    });
    expect(invalidCursor).toEqual({
      status: 400,
      body: {
        error: {
          code: "cursor.invalid",
          message: "Malformed cursor: nope",
        },
      },
    });
    expect(notFound).toEqual({
      status: 404,
      body: {
        error: {
          code: "route.not_found",
          message: "Unknown route.",
        },
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("surfaces invalid project metadata as a JSON error", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await mkdir(join(root, "skills"), { recursive: true });
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/project");

    expect(response).toEqual({
      status: 400,
      body: {
        error: {
          code: "project.invalid",
          message: expect.stringContaining("plico.config.ts"),
        },
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("starts a listening server with servePlico", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const server = await servePlico({
      projectRoot: root,
      databasePath: join(root, ".plico", "plico.sqlite"),
      host: "127.0.0.1",
      port: 0,
    });
    const address = server.address();

    expect(address).not.toBeNull();
    if (address && typeof address !== "string") {
      expect(address.port).toBeGreaterThan(0);
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("Studio", () => {
  it("serves Studio index.html and preserves API when studioPath is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);

    const studioDir = await mkdtemp(join(tmpdir(), "plico-studio-"));
    await mkdir(join(studioDir, "assets"), { recursive: true });
    await writeFile(join(studioDir, "index.html"), "<html><body>Studio</body></html>", "utf8");
    await writeFile(join(studioDir, "assets", "app.js"), "console.log('studio')", "utf8");

    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({
      projectRoot: root,
      eventStore,
      studioPath: studioDir,
    });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const health = await jsonRequest(baseUrl, "/health");
    expect(health).toEqual({ status: 200, body: { ok: true } });

    const indexResponse = await fetch(`${baseUrl}/`);
    expect(indexResponse.status).toBe(200);
    expect(await indexResponse.text()).toBe("<html><body>Studio</body></html>");

    const assetResponse = await fetch(`${baseUrl}/assets/app.js`);
    expect(assetResponse.status).toBe(200);

    const spaResponse = await fetch(`${baseUrl}/some/studio/route`);
    expect(spaResponse.status).toBe(200);
    expect(await spaResponse.text()).toBe("<html><body>Studio</body></html>");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("preserves API-only behavior when studioPath is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const notFound = await jsonRequest(baseUrl, "/some/route");
    expect(notFound).toEqual({
      status: 404,
      body: { error: { code: "route.not_found", message: "Unknown route." } },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("Instructions", () => {
  it("serves composed instructions via /v1/instructions", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/instructions");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sources: ["agent.md"],
      content: expect.stringContaining("Use the local Markdown instructions"),
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("SSE stream", () => {
  async function persistDryRun(baseUrl: string): Promise<string> {
    const run = await jsonRequest(baseUrl, "/v1/runs/dry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: [{ type: "assistant.output", content: "Hello" }],
      }),
    });
    expect(run.status).toBe(200);
    return String((run.body as { runId: string }).runId);
  }

  it("replays persisted events after cursor via GET /v1/runs/:runId/events/stream?after=N", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const runId = await persistDryRun(baseUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const messages = await readSSEStream(
      baseUrl,
      `/v1/runs/${runId}/events/stream?after=2`,
      controller.signal,
    );
    clearTimeout(timeout);

    const eventMessages = messages.filter((m) => m.event === "plico.event");
    expect(eventMessages.length).toBeGreaterThan(0);
    expect(eventMessages[0]?.id).toBe("3");
    expect(eventMessages[0]?.data).toContain("tools.discovered");
    expect(eventMessages[eventMessages.length - 1]?.data).toContain("run.completed");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns JSON 404 for unknown run IDs before starting a stream", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/runs/no-such-run/events/stream");
    expect(response).toEqual({
      status: 404,
      body: { error: { code: "run.not_found", message: "Unknown run ID: no-such-run" } },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns JSON 400 for malformed cursors before starting a stream", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/runs/any-run/events/stream?after=nope");
    expect(response).toEqual({
      status: 400,
      body: {
        error: {
          code: "cursor.invalid",
          message: "Malformed cursor: nope",
        },
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends heartbeats during the stream", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const runId = await persistDryRun(baseUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const messages = await readSSEStream(
      baseUrl,
      `/v1/runs/${runId}/events/stream?after=0`,
      controller.signal,
    );
    clearTimeout(timeout);

    const heartbeats = messages.filter((m) => m.comment === "heartbeat");
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("closes the stream cleanly after terminal event", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const runId = await persistDryRun(baseUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const messages = await readSSEStream(
      baseUrl,
      `/v1/runs/${runId}/events/stream?after=0`,
      controller.signal,
    );
    clearTimeout(timeout);

    const eventMessages = messages.filter((m) => m.event === "plico.event");
    expect(eventMessages.length).toBeGreaterThan(0);
    const lastEventData = eventMessages[eventMessages.length - 1]?.data;
    expect(lastEventData).toBeDefined();
    expect(JSON.parse(lastEventData as string)).toMatchObject({
      type: expect.stringMatching(/^run\.(completed|failed|blocked|error)$/),
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("preserves existing non-stream event endpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-sse-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const runId = await persistDryRun(baseUrl);

    const events = await jsonRequest(baseUrl, `/v1/runs/${runId}/events?after=0`);
    expect(events.status).toBe(200);
    expect(events.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run.started" }),
        expect.objectContaining({ type: "run.completed" }),
      ]),
    );

    const runs = await jsonRequest(baseUrl, "/v1/runs");
    expect(runs.status).toBe(200);
    expect(Array.isArray(runs.body)).toBe(true);
    expect((runs.body as Array<unknown>).length).toBeGreaterThan(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("Artifact workspace", () => {
  it("returns reconstructed artifact workspace from a dry run with artifact.write steps", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const run = await jsonRequest(baseUrl, "/v1/runs/dry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: [
          {
            type: "artifact.write",
            files: [
              { path: "summary.md", content: "# Done", mimeType: "text/markdown" },
              { path: "data.json", content: '{"ok":true}' },
            ],
          },
        ],
      }),
    });

    expect(run.status).toBe(200);
    const runId = String((run.body as { runId: string }).runId);

    const workspace = await jsonRequest(baseUrl, `/v1/runs/${runId}/workspace`);
    expect(workspace.status).toBe(200);
    const ws = workspace.body as Record<string, unknown>;
    expect(ws.workspaceId).toBeDefined();
    expect(ws.runId).toBe(runId);
    expect(ws.files).toHaveLength(2);
    expect((ws.files as Array<Record<string, unknown>>)[0]).toMatchObject({
      path: "summary.md",
      mimeType: "text/markdown",
    });
    expect((ws.files as Array<Record<string, unknown>>)[1]).toMatchObject({
      path: "data.json",
      mimeType: "text/plain",
    });
    expect(ws.snapshots).toHaveLength(1);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 404 for a run without artifact events", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const run = await jsonRequest(baseUrl, "/v1/runs/dry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: [{ type: "assistant.output", content: "Hello" }],
      }),
    });

    const runId = String((run.body as { runId: string }).runId);
    const workspace = await jsonRequest(baseUrl, `/v1/runs/${runId}/workspace`);
    expect(workspace).toEqual({
      status: 404,
      body: { error: { code: "workspace.not_found", message: expect.stringContaining(runId) } },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 404 for an unknown run ID", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const workspace = await jsonRequest(baseUrl, "/v1/runs/no-such-run/workspace");
    expect(workspace).toEqual({
      status: 404,
      body: { error: { code: "run.not_found", message: "Unknown run ID: no-such-run" } },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("Readiness endpoint", () => {
  it("returns the same report shape as the CLI JSON mode via GET /v1/readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/readiness");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      projectRoot: root,
      timestamp: expect.any(String),
      summary: { ok: expect.any(Number), warning: expect.any(Number), error: expect.any(Number) },
      diagnostics: expect.any(Array),
    });

    const body = response.body as { diagnostics: Array<Record<string, unknown>> };
    expect(body.diagnostics.some((d) => d.subsystem === "project.structure")).toBe(true);
    expect(body.diagnostics.some((d) => d.subsystem === "tools.discovery")).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("Eval endpoint", () => {
  it("runs eval cases via POST /v1/eval and returns summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "evals", "test.script.json"),
      JSON.stringify({
        name: "server-eval",
        script: [{ type: "assistant.output", content: "Hello from server eval" }],
      }),
      "utf8",
    );

    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/eval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      passed: 1,
      failed: 0,
      results: [
        {
          name: "server-eval",
          status: "pass",
          runStatus: "completed",
          output: "Hello from server eval",
        },
      ],
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("persists eval runs through the event store and returns run IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "plico-server-"));
    await writeValidProject(root);
    await writeFile(
      join(root, "evals", "persist-test.script.json"),
      JSON.stringify({
        name: "persist-eval",
        script: [{ type: "assistant.output", content: "Persist this" }],
      }),
      "utf8",
    );

    const eventStore = createSqliteEventStore({
      databasePath: join(root, ".plico", "plico.sqlite"),
    });
    const serverApi = await createPlicoServer({ projectRoot: root, eventStore });
    const { baseUrl, server } = await startTestServer(serverApi.requestListener);

    const response = await jsonRequest(baseUrl, "/v1/eval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(200);
    const summary = response.body as { results?: Array<Record<string, unknown>> };
    const runId = String(summary.results?.[0]?.runId ?? "");

    const run = await jsonRequest(baseUrl, `/v1/runs/${runId}`);
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({
      runId,
      status: "completed",
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
