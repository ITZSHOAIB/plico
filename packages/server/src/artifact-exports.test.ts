import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, runProject } from "@plico/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function startArtifactProject() {
  const root = await mkdtemp(join(tmpdir(), "plico-artifact-export-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  const eventStore = createSqliteEventStore({ databasePath: join(root, "state.sqlite") });
  const api = await createPlicoServer({ projectRoot: root, eventStore });
  const server = createServer(api.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    eventStore,
    root,
  };
}

async function exportFile(project: Awaited<ReturnType<typeof startArtifactProject>>, path: string) {
  const result = await runProject(project.root, {
    eventStore: project.eventStore,
    script: [
      { type: "artifact.write", files: [{ path, content: "export me", mimeType: "text/html" }] },
    ],
  });
  const url = new URL(`/v1/runs/${result.runId}/workspace/exports`, project.baseUrl);
  url.searchParams.set("path", path);
  return fetch(url);
}

describe("artifact exports", () => {
  it("marks HTML content as nosniff and serves it as a download", async () => {
    const project = await startArtifactProject();
    const response = await exportFile(project, "report.html");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).not.toBe("text/html");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(await response.text()).toBe("export me");
  });

  it("uses a non-empty attachment filename when the path has no final segment", async () => {
    const project = await startArtifactProject();
    const response = await exportFile(project, "dir/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''artifact",
    );
  });

  it("returns 404 for unknown runs and files", async () => {
    const project = await startArtifactProject();
    const unknownRun = await fetch(
      `${project.baseUrl}/v1/runs/missing/workspace/exports?path=missing.txt`,
    );
    const result = await runProject(project.root, {
      eventStore: project.eventStore,
      script: [{ type: "artifact.write", files: [{ path: "known.txt", content: "content" }] }],
    });
    const unknownFile = await fetch(
      `${project.baseUrl}/v1/runs/${result.runId}/workspace/exports?path=missing.txt`,
    );

    expect(unknownRun.status).toBe(404);
    expect(unknownFile.status).toBe(404);
  });
});
