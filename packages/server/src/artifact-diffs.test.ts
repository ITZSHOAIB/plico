import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSqliteEventStore, runProject } from "@plico/runtime";
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

async function startArtifactProject() {
  const root = await mkdtemp(join(tmpdir(), "plico-artifact-diff-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const api = await createPlicoServer({ projectRoot: root, eventStore });
  const baseUrl = await listen(api.requestListener);
  return { baseUrl, databasePath, eventStore, root };
}

async function getJson(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function runTwoVersions(
  project: Awaited<ReturnType<typeof startArtifactProject>>,
  path = "docs/a.md",
): Promise<string> {
  const result = await runProject(project.root, {
    eventStore: project.eventStore,
    script: [
      { type: "artifact.write", files: [{ path, content: "one" }] },
      { type: "artifact.write", files: [{ path, content: "two" }] },
    ],
  });
  return result.runId;
}

function diffUrl(baseUrl: string, runId: string, path: string, from = 1, to = 2): string {
  const query = new URLSearchParams({ path, fromVersion: String(from), toVersion: String(to) });
  return `${baseUrl}/v1/runs/${runId}/workspace/diffs?${query}`;
}

describe("artifact version diffs", () => {
  it("reads files whose paths end in /diff", async () => {
    const project = await startArtifactProject();
    const runId = await runTwoVersions(project, "x/diff");

    const file = await getJson(`${project.baseUrl}/v1/runs/${runId}/workspace/files/x/diff`);

    expect(file.status).toBe(200);
    expect(file.body).toMatchObject({ path: "x/diff", content: "two", version: 2 });
  });

  it("diffs two versions of an artifact through the API", async () => {
    const project = await startArtifactProject();
    const runId = await runTwoVersions(project);

    const diff = await getJson(diffUrl(project.baseUrl, runId, "docs/a.md"));

    expect(diff.status).toBe(200);
    expect(diff.body).toMatchObject({ path: "docs/a.md", fromVersion: 1, toVersion: 2 });
    expect(diff.body.diff).toContain("-one");
    expect(diff.body.diff).toContain("+two");
  });

  it("selects the same content when version receipts are mixed with legacy events", async () => {
    const project = await startArtifactProject();
    const runId = await runTwoVersions(project);
    const events = await project.eventStore.getEvents(runId);
    const first = events.find(
      (event) => event.type === "artifact.file.written" && event.payload.version === 1,
    );
    if (first?.type !== "artifact.file.written") throw new Error("Missing first artifact write");
    const database = new DatabaseSync(project.databasePath);
    database.prepare("UPDATE events SET payload_json = ? WHERE stream_id = ? AND sequence = ?").run(
      JSON.stringify({
        path: first.payload.path,
        mimeType: first.payload.mimeType,
        contentHash: first.payload.contentHash,
      }),
      runId,
      first.sequence,
    );

    const workspace = await getJson(`${project.baseUrl}/v1/runs/${runId}/workspace`);
    const diff = await getJson(diffUrl(project.baseUrl, runId, "docs/a.md"));

    expect(workspace.body.versions).toMatchObject([
      { path: "docs/a.md", version: 1 },
      { path: "docs/a.md", version: 2 },
    ]);
    expect(diff.status).toBe(200);
    expect(diff.body.diff).toContain("-one");
    expect(diff.body.diff).toContain("+two");
    database.close();
  });

  it("rejects invalid selectors, missing files, and unknown versions", async () => {
    const project = await startArtifactProject();
    const runId = await runTwoVersions(project);

    const invalid = await getJson(diffUrl(project.baseUrl, runId, "docs/a.md", NaN, 2));
    const missing = await getJson(
      `${project.baseUrl}/v1/runs/${runId}/workspace/diffs?path=missing.md&fromVersion=latest&toVersion=2`,
    );
    const unknown = await getJson(diffUrl(project.baseUrl, runId, "docs/a.md", 1, 3));

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: { code: "artifact.invalid_version" } });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: "artifact.not_found" } });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ error: { code: "artifact.version_not_found" } });
  });

  it("returns an unknown run error before validating diff selectors", async () => {
    const project = await startArtifactProject();

    const response = await getJson(
      `${project.baseUrl}/v1/runs/missing/workspace/diffs?path=docs%2Fa.md&fromVersion=latest&toVersion=2`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "run.not_found" } });
  });

  it("allows JSON and rejects non-text or oversized content", async () => {
    const project = await startArtifactProject();
    const largeContent = "x".repeat(1024 * 1024 + 1);
    const result = await runProject(project.root, {
      eventStore: project.eventStore,
      script: [
        {
          type: "artifact.write",
          files: [{ path: "image.png", content: "pixels", mimeType: "image/png" }],
        },
        { type: "artifact.write", files: [{ path: "large.txt", content: largeContent }] },
        {
          type: "artifact.write",
          files: [{ path: "record.json", content: '{"ok":true}', mimeType: "application/json" }],
        },
        {
          type: "artifact.write",
          files: [{ path: "record.json", content: '{"ok":false}', mimeType: "application/json" }],
        },
      ],
    });

    const nonText = await getJson(diffUrl(project.baseUrl, result.runId, "image.png", 1, 1));
    const oversized = await getJson(diffUrl(project.baseUrl, result.runId, "large.txt", 1, 1));
    const json = await getJson(diffUrl(project.baseUrl, result.runId, "record.json"));

    expect(nonText.status).toBe(415);
    expect(nonText.body).toMatchObject({ error: { code: "artifact.diff_unsupported_media_type" } });
    expect(oversized.status).toBe(413);
    expect(oversized.body).toMatchObject({ error: { code: "artifact.diff_too_large" } });
    expect(json.status).toBe(200);
    expect(json.body.diff).toContain('-{"ok":true}');
    expect(json.body.diff).toContain('+{"ok":false}');
  });
});

describe("artifact exports", () => {
  it("downloads a workspace file with its media type and filename", async () => {
    const project = await startArtifactProject();
    const result = await runProject(project.root, {
      eventStore: project.eventStore,
      script: [
        {
          type: "artifact.write",
          files: [
            { path: "reports/summary report.txt", content: "export me", mimeType: "text/plain" },
          ],
        },
      ],
    });

    const response = await fetch(
      `${project.baseUrl}/v1/runs/${result.runId}/workspace/exports?path=${encodeURIComponent("reports/summary report.txt")}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''summary%20report.txt",
    );
    expect(await response.text()).toBe("export me");
  });

  it("returns 404 for unknown runs and files", async () => {
    const project = await startArtifactProject();
    const unknownRun = await fetch(
      `${project.baseUrl}/v1/runs/missing/workspace/exports?path=missing.txt`,
    );
    const result = await runTwoVersions(project);
    const unknownFile = await fetch(
      `${project.baseUrl}/v1/runs/${result}/workspace/exports?path=missing.txt`,
    );

    expect(unknownRun.status).toBe(404);
    expect(unknownFile.status).toBe(404);
  });
});
