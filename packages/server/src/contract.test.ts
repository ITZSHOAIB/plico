import { mkdir, mkdtemp, unlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  runProject,
} from "@plico/runtime";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createPlicoServer } from "./index.js";

type Shape = string | Shape[] | { [key: string]: Shape };

function isRecord(value: Shape): value is { [key: string]: Shape } {
  return typeof value === "object" && !Array.isArray(value);
}

function merge(left: Shape, right: Shape): Shape {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length === 0) return right;
    if (right.length === 0) return left;
    return [merge(left[0] as Shape, right[0] as Shape)];
  }
  if (isRecord(left) && isRecord(right)) {
    const merged: { [key: string]: Shape } = {};
    for (const key of Object.keys({ ...left, ...right }).sort()) {
      const [a, b] = [left[key], right[key]];
      merged[key] = a === undefined ? (b as Shape) : b === undefined ? a : merge(a, b);
    }
    return merged;
  }

  if (JSON.stringify(left) === JSON.stringify(right)) return left;
  return [...new Set(`${String(left)}|${String(right)}`.split("|"))].sort().join("|");
}

function shapeOf(value: unknown): Shape {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const shapes = value.map(shapeOf);
    return shapes.length === 0 ? [] : [shapes.reduce(merge)];
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, item]) => [key, shapeOf(item)]));
  }
  return typeof value;
}

let server: Server;
let baseUrl: string;
let root: string;
let providerRunId: string;
let eventStore: ReturnType<typeof createSqliteEventStore>;
let engine: ReturnType<typeof createSqliteEngine>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "plico-contract-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", execution: { leaseMs: 30000 } } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  const script = [{ type: "assistant.output", content: "Hi" }];
  await writeFile(
    join(root, "evals", "pass.script.json"),
    JSON.stringify({ description: "Says hi", script }),
  );
  await writeFile(
    join(root, "evals", "fail.script.json"),
    JSON.stringify({ script, expect: { outputContains: "nope" } }),
  );

  const databasePath = join(root, "state.sqlite");
  eventStore = createSqliteEventStore({ databasePath });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", execution: { leaseMs: 30000 }, model: { provider: "fake", name: "test" } } as const;\n',
  );
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    `export default { name: "lookup", description: "Look up a record", inputSchema: { type: "object" }, capabilities: [], approval: { required: false }, handler: () => "found" };`,
  );
  let turn = 0;
  const providerRun = await runProject(root, {
    message: "Find it",
    eventStore,
    provider: {
      async *stream() {
        if (turn++ === 0) {
          yield { type: "text", text: "Searching" };
          yield {
            type: "tool.call",
            call: {
              id: "call-1",
              name: "lookup",
              arguments: {},
              providerMetadata: { callToken: "opaque" },
            },
          };
          yield {
            type: "finish",
            usage: { inputTokens: 2, outputTokens: 1 },
            providerMetadata: { cursor: "opaque" },
          };
        } else {
          yield { type: "text", text: "Found" };
          yield { type: "finish", usage: { inputTokens: 2, outputTokens: 1 } };
        }
      },
    },
  });
  if (providerRun.status !== "completed") throw new Error("Provider fixture did not complete");
  providerRunId = providerRun.runId;
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo", execution: { leaseMs: 30000 } } as const;\n',
  );
  await unlink(join(root, "tools", "lookup.tool.ts"));
  engine = createSqliteEngine({ databasePath });
  const api = await createPlicoServer({
    projectRoot: root,
    eventStore,
    engine,
    threadStore: createSqliteThreadStore({ databasePath: join(root, "state.sqlite") }),
    provider: {
      async *stream() {
        yield { type: "text", text: "Hello" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  server = createServer(api.requestListener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function shape(path: string, init?: RequestInit): Promise<Shape> {
  const response = await fetch(`${baseUrl}${path}`, init);
  return shapeOf(await response.json());
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// A failure here means a wire shape changed. Additive changes: update the snapshot
// with vitest -u. Breaking changes after the first publish: see product/adrs/0006.
it("keeps the /v1 response shapes stable", async () => {
  const dryRun = post({
    script: [
      { type: "assistant.output", content: "Hi" },
      { type: "artifact.write", files: [{ path: "a.md", content: "one" }] },
    ],
  });
  const run = (await (await fetch(`${baseUrl}/v1/runs/dry`, dryRun)).json()) as { runId: string };
  const runPath = `/v1/runs/${run.runId}`;
  const workspace = (await (await fetch(`${baseUrl}${runPath}/workspace`)).json()) as {
    snapshots: Array<{ snapshotId: string }>;
  };

  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    'export default { name: "archive", description: "Archive a record", inputSchema: { type: "object" }, capabilities: [], approval: { required: true }, handler: () => "archived" };',
  );
  const approvalRun = await runProject(root, {
    runId: "approval-contract",
    script: [{ type: "tool.call", toolName: "archive", arguments: {} }],
    eventStore,
    engine,
  });
  if (approvalRun.status !== "waiting") throw new Error("Approval fixture did not wait");

  const providerEvents = (await (
    await fetch(`${baseUrl}/v1/runs/${providerRunId}/events`)
  ).json()) as Array<{ type: string }>;
  const providerShapes = Object.fromEntries(
    ["model.request", "model.attempt", "model.delta", "model.response"].map((type) => {
      const matching = providerEvents.filter((event) => event.type === type);
      if (matching.length === 0) throw new Error(`Missing provider event: ${type}`);
      return [type, shapeOf(matching)];
    }),
  );

  const createdThread = (await (
    await fetch(`${baseUrl}/v1/threads`, { method: "POST" })
  ).json()) as { id: string };
  const threadPath = `/v1/threads/${createdThread.id}`;
  const posted = (await (
    await fetch(`${baseUrl}${threadPath}/messages`, post({ content: "Hello" }))
  ).json()) as { runId: string };
  await vi.waitFor(async () => {
    const response = await fetch(`${baseUrl}/v1/runs/${posted.runId}`);
    const run = (await response.json()) as { status: string };
    expect(run.status).toBe("completed");
  });

  const decisionResponse = await fetch(`${baseUrl}/v1/runs/${approvalRun.runId}/signal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `approval:${approvalRun.runId}:0`, value: { approved: true } }),
  });
  const decisionResult = await decisionResponse.json();
  expect(decisionResponse.status).toBe(200);
  await vi.waitFor(async () => {
    const response = await fetch(`${baseUrl}/v1/runs/${approvalRun.runId}`);
    const run = (await response.json()) as { status: string };
    expect(run.status).toBe("completed");
  });
  const approvalEvents = (await (
    await fetch(`${baseUrl}/v1/runs/${approvalRun.runId}/events`)
  ).json()) as Array<{ type: string }>;
  await unlink(join(root, "tools", "archive.tool.ts"));

  const shapes = {
    "POST /v1/threads": shapeOf(createdThread),
    "POST /v1/threads/:id/messages": shapeOf(posted),
    "GET /v1/threads": await shape("/v1/threads"),
    "GET /v1/threads/:id": await shape(threadPath),
    "GET /v1/threads/:id/messages": await shape(`${threadPath}/messages`),
    "GET /v1/runs/:id/events (provider)": providerShapes,
    "GET /v1/runs/:id/events (approval)": approvalEvents
      .filter((event) => event.type === "approval.decided")
      .map((event) => shapeOf(event)),
    "POST /v1/runs/:id/signal (approval)": shapeOf(decisionResult),
    "POST /v1/runs/dry": await shape("/v1/runs/dry", dryRun),
    "GET /v1/project": await shape("/v1/project"),
    "GET /v1/instructions": await shape("/v1/instructions"),
    "GET /v1/runs": await shape("/v1/runs"),
    "GET /v1/runs/:id": await shape(runPath),
    "GET /v1/runs/:id/events": await shape(`${runPath}/events`),
    "GET /v1/runs/:id/workspace": await shape(`${runPath}/workspace`),
    "GET /v1/runs/:id/workspace/files/:path": await shape(`${runPath}/workspace/files/a.md`),
    "GET /v1/runs/:id/workspace/snapshots/:id": await shape(
      `${runPath}/workspace/snapshots/${workspace.snapshots[0]?.snapshotId}`,
    ),
    "POST /v1/eval": await shape("/v1/eval", { method: "POST" }),
    "GET /v1/eval": await shape("/v1/eval"),
    "GET /v1/eval/:name": await shape("/v1/eval/fail"),
    "GET /v1/readiness": await shape("/v1/readiness"),
    "POST /v1/runs": await shape("/v1/runs", post({})),
    error: await shape("/v1/runs/missing"),
  };

  await expect(`${JSON.stringify(shapes, null, 2)}\n`).toMatchFileSnapshot("./v1-contract.snap");
});
