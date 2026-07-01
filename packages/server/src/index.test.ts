import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlicoServer, servePlico } from "./index.js";

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
