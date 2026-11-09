import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlico, type Plico } from "./index.js";

async function openPlico(): Promise<Plico> {
  const root = await mkdtemp(join(tmpdir(), "plico-mount-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Mount Agent" };',
  );
  await writeFile(join(root, "agent.md"), "Answer briefly.");
  await writeFile(
    join(root, "tools", "who.tool.ts"),
    'export default { name: "who", description: "Report the caller", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: (_input, ctx) => ({ context: ctx.context ?? null }) };',
  );
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    'export default { name: "archive", description: "Archive a record", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "archived" };',
  );
  return createPlico({ projectRoot: root, databasePath: join(root, "state.sqlite") });
}

const whoScript = [{ type: "tool.call", toolName: "who", arguments: {}, result: {} }];
const byUser = (request: Request) => ({ userId: request.headers.get("x-user") ?? "" });

type Handler = (request: Request) => Promise<Response>;
type EventList = Array<{ type: string; payload: Record<string, unknown> }>;

function call(
  handler: Handler,
  user: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return handler(
    new Request(`https://app.example${path}`, {
      method: init.method ?? "GET",
      headers: { "x-user": user, ...(init.body ? { "content-type": "application/json" } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("mounted API with scope", () => {
  it("keeps one user's threads, runs and artifacts from another", async () => {
    const plico = await openPlico();
    try {
      const api = plico.fetch({ scope: byUser, allowScript: true });
      const thread = await json<{ id: string; metadata: unknown }>(
        await call(api, "ann", "/v1/threads", { method: "POST" }),
      );
      expect(thread.metadata).toEqual({ userId: "ann" });
      const run = await json<{ runId: string }>(
        await call(api, "ann", "/v1/runs", { method: "POST", body: { script: whoScript } }),
      );

      for (const path of [`/v1/threads/${thread.id}`, `/v1/runs/${run.runId}`])
        expect((await call(api, "ann", path)).status).toBe(200);

      const foreign = [
        ["GET", `/v1/threads/${thread.id}`],
        ["PATCH", `/v1/threads/${thread.id}`, { title: "mine now" }],
        ["GET", `/v1/threads/${thread.id}/messages`],
        ["POST", `/v1/threads/${thread.id}/messages`, { content: "hi", startRun: false }],
        ["GET", `/v1/threads/${thread.id}/workspace`],
        ["GET", `/v1/runs/${run.runId}`],
        ["GET", `/v1/runs/${run.runId}/events`],
        ["GET", `/v1/runs/${run.runId}/events/stream`],
        ["POST", `/v1/runs/${run.runId}/cancel`],
        ["POST", `/v1/runs/${run.runId}/signal`, { name: "approval:x", value: { approved: true } }],
        ["GET", `/v1/runs/${run.runId}/workspace`],
        ["GET", `/v1/runs/${run.runId}/workspace/exports`],
        ["GET", `/v1/runs/${run.runId}/workspace/diffs`],
      ] as const;
      for (const [method, path, body] of foreign) {
        const response = await call(api, "bob", path, { method, body });
        expect(response.status, `${method} ${path}`).toBe(404);
      }

      expect(await json(await call(api, "bob", "/v1/threads"))).toEqual([]);
      expect(await json(await call(api, "bob", "/v1/runs"))).toEqual([]);
      expect(await json<unknown[]>(await call(api, "ann", "/v1/runs"))).toHaveLength(1);
    } finally {
      await plico.close();
    }
  });

  it("does not let a client widen the scope or set its own metadata", async () => {
    const plico = await openPlico();
    try {
      const api = plico.fetch({ scope: byUser });
      await call(api, "ann", "/v1/threads", { method: "POST" });
      const asAnn = encodeURIComponent(JSON.stringify({ userId: "ann" }));
      expect(await json(await call(api, "bob", `/v1/threads?metadata=${asAnn}`))).toEqual([]);

      const forged = await call(api, "bob", "/v1/threads", {
        method: "POST",
        body: { metadata: { userId: "ann" } },
      });
      expect(forged.status).toBe(400);
    } finally {
      await plico.close();
    }
  });

  it("serves project-level routes only when unscoped", async () => {
    const plico = await openPlico();
    try {
      const scoped = plico.fetch({ scope: byUser });
      for (const path of ["/v1/project", "/v1/instructions", "/v1/readiness", "/v1/eval"])
        expect((await call(scoped, "ann", path)).status, path).toBe(404);
      expect((await call(plico.fetch(), "ann", "/v1/project")).status).toBe(200);
    } finally {
      await plico.close();
    }
  });

  it("fails closed when the scope cannot be computed", async () => {
    const plico = await openPlico();
    try {
      const failing = plico.fetch({
        scope: () => {
          throw new Error("no session");
        },
      });
      const empty = plico.fetch({ scope: () => undefined });
      for (const api of [failing, empty]) {
        const response = await call(api, "ann", "/v1/threads");
        expect(response.status).toBe(500);
        expect((await json<{ error: { code: string } }>(response)).error.code).toBe("server.error");
      }
    } finally {
      await plico.close();
    }
  });

  it("records the host's context on runs and approval decisions", async () => {
    const plico = await openPlico();
    try {
      const api = plico.fetch({
        scope: byUser,
        context: (request) => ({ actor: request.headers.get("x-user") ?? "" }),
        allowScript: true,
      });
      const { runId } = await json<{ runId: string }>(
        await call(api, "ann", "/v1/runs", {
          method: "POST",
          body: {
            script: [
              { type: "tool.call", toolName: "who", arguments: {}, result: {} },
              { type: "tool.call", toolName: "archive", arguments: {}, result: {} },
            ],
          },
        }),
      );

      const readEvents = async () =>
        json<EventList>(await call(api, "ann", `/v1/runs/${runId}/events`));
      let events = await readEvents();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (events.some((event) => event.type === "approval.requested")) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
        events = await readEvents();
      }
      expect(events.find((event) => event.type === "run.started")?.payload.context).toEqual({
        actor: "ann",
      });
      const requested = events.find((event) => event.type === "approval.requested");
      const requestId = String(requested?.payload.requestId);

      await call(api, "ann", `/v1/runs/${runId}/signal`, {
        method: "POST",
        body: {
          name: `approval:${requestId}`,
          value: { approved: true, context: { actor: "forged" } },
        },
      });
      let decided = (await readEvents()).find((event) => event.type === "approval.decided");
      for (let attempt = 0; attempt < 50 && !decided; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        decided = (await readEvents()).find((event) => event.type === "approval.decided");
      }
      expect(decided?.payload.context).toEqual({ actor: "ann" });
    } finally {
      await plico.close();
    }
  });

  it("answers under a basePath", async () => {
    const plico = await openPlico();
    try {
      const api = plico.fetch({ scope: byUser, basePath: "/plico" });
      expect((await call(api, "ann", "/plico/v1/threads", { method: "POST" })).status).toBe(201);
      expect((await call(api, "ann", "/plico/health")).status).toBe(200);
    } finally {
      await plico.close();
    }
  });
});

describe("node handler", () => {
  it("reads a body the host already parsed into req.body", async () => {
    const plico = await openPlico();
    const handler = plico.node({ scope: byUser });
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        // What express.json() does: the stream is drained and the result left on req.body.
        (req as typeof req & { body?: unknown }).body = JSON.parse(
          Buffer.concat(chunks).toString(),
        );
        handler(req, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/v1/threads`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user": "ann" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(201);
      expect((await json<{ metadata: unknown }>(response)).metadata).toEqual({ userId: "ann" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await plico.close();
    }
  });
});
