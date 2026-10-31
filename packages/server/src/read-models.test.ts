import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore } from "@plico/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function listen(listener: RequestListener): Promise<string> {
  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startProject(options: { evalCase?: unknown; studioPath?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "plico-read-models-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  if (options.evalCase) {
    await writeFile(join(root, "evals", "case.script.json"), JSON.stringify(options.evalCase));
  }
  const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
  const api = await createPlicoServer({
    projectRoot: root,
    eventStore,
    ...(options.studioPath === undefined ? {} : { studioPath: options.studioPath }),
  });
  return listen(api.requestListener);
}

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function runWithArtifacts(baseUrl: string): Promise<string> {
  const { body } = await getJson(`${baseUrl}/v1/runs/dry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      script: [
        { type: "artifact.write", files: [{ path: "docs/a.md", content: "one" }] },
        { type: "artifact.write", files: [{ path: "docs/a.md", content: "two" }] },
      ],
    }),
  });
  return String(body.runId);
}

describe("artifact reads", () => {
  it("reads one file by its nested path", async () => {
    const baseUrl = await startProject();
    const runId = await runWithArtifacts(baseUrl);

    const file = await getJson(`${baseUrl}/v1/runs/${runId}/workspace/files/docs/a.md`);

    expect(file).toEqual({
      status: 200,
      body: { path: "docs/a.md", content: "two", mimeType: "text/plain", version: 2 },
    });
  });

  it("reads a snapshot with its files at that point", async () => {
    const baseUrl = await startProject();
    const runId = await runWithArtifacts(baseUrl);
    const workspace = await getJson(`${baseUrl}/v1/runs/${runId}/workspace`);
    const [first] = workspace.body.snapshots as Array<{ snapshotId: string }>;

    const snapshot = await getJson(
      `${baseUrl}/v1/runs/${runId}/workspace/snapshots/${first?.snapshotId}`,
    );

    expect(snapshot.status).toBe(200);
    expect(snapshot.body.files).toEqual([
      { path: "docs/a.md", content: "one", mimeType: "text/plain", version: 1 },
    ]);
  });

  it("returns JSON errors for unknown runs and artifacts", async () => {
    const baseUrl = await startProject();
    const runId = await runWithArtifacts(baseUrl);

    const file = await getJson(`${baseUrl}/v1/runs/${runId}/workspace/files/missing.md`);
    const snapshot = await getJson(`${baseUrl}/v1/runs/${runId}/workspace/snapshots/missing`);
    const run = await getJson(`${baseUrl}/v1/runs/missing/workspace/files/a.md`);

    expect(file.status).toBe(404);
    expect(file.body).toMatchObject({ error: { code: "artifact.not_found" } });
    expect(snapshot.status).toBe(404);
    expect(snapshot.body).toMatchObject({ error: { code: "artifact.not_found" } });
    expect(run.status).toBe(404);
    expect(run.body).toMatchObject({ error: { code: "run.not_found" } });
  });
});

describe("eval reads", () => {
  const evalCase = { name: "ok", script: [{ type: "assistant.output", content: "Hi" }] };

  it("reads the latest report without running evals again", async () => {
    const baseUrl = await startProject({ evalCase });
    await getJson(`${baseUrl}/v1/eval`, { method: "POST" });
    const before = await getJson(`${baseUrl}/v1/runs`);

    const report = await getJson(`${baseUrl}/v1/eval`);

    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({
      total: 1,
      passed: 1,
      evaluatedAt: expect.any(String),
    });
    expect(await getJson(`${baseUrl}/v1/runs`)).toEqual(before);
  });

  it("reads one eval case by name", async () => {
    const baseUrl = await startProject({ evalCase });
    await getJson(`${baseUrl}/v1/eval`, { method: "POST" });

    const result = await getJson(`${baseUrl}/v1/eval/ok`);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ name: "ok", status: "pass" });
  });

  it("returns JSON errors for missing reports and unknown evals", async () => {
    const baseUrl = await startProject({ evalCase });

    const report = await getJson(`${baseUrl}/v1/eval`);
    await getJson(`${baseUrl}/v1/eval`, { method: "POST" });
    const result = await getJson(`${baseUrl}/v1/eval/missing`);

    expect(report.status).toBe(404);
    expect(report.body).toMatchObject({ error: { code: "eval.not_found" } });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: { code: "eval.not_found" } });
  });
});

describe("readiness", () => {
  it("reports Studio assets when the server is serving Studio", async () => {
    const studioPath = join(await mkdtemp(join(tmpdir(), "plico-studio-")), "missing");
    const baseUrl = await startProject({ studioPath });

    const report = await getJson(`${baseUrl}/v1/readiness`);

    expect(report.body.diagnostics).toContainEqual(
      expect.objectContaining({ subsystem: "studio.assets", severity: "warning" }),
    );
  });
});
