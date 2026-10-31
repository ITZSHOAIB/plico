import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

type Shape = string | Shape[] | { [key: string]: Shape };

function isRecord(value: Shape): value is { [key: string]: Shape } {
  return typeof value === "object" && !Array.isArray(value);
}

function merge(left: Shape, right: Shape): Shape {
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

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-contract-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
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

  const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
  const api = await createPlicoServer({ projectRoot: root, eventStore });
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

  const shapes = {
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
    error: await shape("/v1/runs/missing"),
  };

  await expect(`${JSON.stringify(shapes, null, 2)}\n`).toMatchFileSnapshot("./v1-contract.snap");
});
