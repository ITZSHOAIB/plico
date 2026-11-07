import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteEventStore, createSqliteThreadStore, runProject } from "@plico/runtime";
import { afterEach, expect, it } from "vitest";
import { createPlicoServer } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

it("projects thread files, inherited run workspaces, versions, diffs, and exports over HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-artifact-api-"));
  for (const directory of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, directory));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await writeFile(
    join(root, "tools", "write-report.tool.ts"),
    `export default {
      name: "write_report", description: "Write a versioned report",
      inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"], additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async ({ content }, { artifacts }) => artifacts.write("reports/status.txt", content),
    };`,
  );

  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const threadStore = createSqliteThreadStore({ databasePath });
  const thread = await threadStore.createThread();
  const first = await runProject(root, {
    runId: "artifact-thread-run-1",
    threadId: thread.id,
    eventStore,
    script: [{ type: "tool.call", toolName: "write_report", arguments: { content: "Draft" } }],
  });
  const second = await runProject(root, {
    runId: "artifact-thread-run-2",
    threadId: thread.id,
    eventStore,
    script: [{ type: "tool.call", toolName: "write_report", arguments: { content: "Final" } }],
  });
  const third = await runProject(root, {
    runId: "artifact-thread-run-3",
    threadId: thread.id,
    eventStore,
    script: [{ type: "tool.call", toolName: "write_report", arguments: { content: "Later" } }],
  });

  expect(first.status).toBe("completed");
  expect(second.status).toBe("completed");
  expect(third.status).toBe("completed");
  const api = await createPlicoServer({ projectRoot: root, eventStore, threadStore });
  const server = createServer(api.requestListener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const threadResponse = await fetch(`${baseUrl}/v1/threads/${thread.id}/workspace`);
  const threadWorkspace = (await threadResponse.json()) as {
    threadId: string;
    workspaceId: string;
    files: Array<{ path: string; content: string; version: number }>;
    versions: Array<{ path: string; version: number; runId: string }>;
  };
  const runResponse = await fetch(`${baseUrl}/v1/runs/${second.runId}/workspace`);
  const runWorkspace = (await runResponse.json()) as {
    runId: string;
    files: Array<{ path: string; content: string; version: number }>;
    versions: Array<{ path: string; version: number; runId: string }>;
  };
  const diff = await fetch(
    `${baseUrl}/v1/runs/${second.runId}/workspace/diffs?path=reports%2Fstatus.txt&fromVersion=1&toVersion=2`,
  );
  const download = await fetch(
    `${baseUrl}/v1/runs/${second.runId}/workspace/exports?path=reports%2Fstatus.txt`,
  );

  expect(threadResponse.status).toBe(200);
  expect(threadWorkspace).toMatchObject({
    threadId: thread.id,
    workspaceId: `${thread.id}:workspace`,
    files: [{ path: "reports/status.txt", content: "Later", version: 3 }],
    versions: [
      { path: "reports/status.txt", version: 1, runId: first.runId },
      { path: "reports/status.txt", version: 2, runId: second.runId },
      { path: "reports/status.txt", version: 3, runId: third.runId },
    ],
  });
  expect(runWorkspace).toMatchObject({
    runId: second.runId,
    files: [{ path: "reports/status.txt", content: "Final", version: 2 }],
    versions: [
      { path: "reports/status.txt", version: 1, runId: first.runId },
      { path: "reports/status.txt", version: 2, runId: second.runId },
    ],
  });
  expect(diff.status).toBe(200);
  expect(await diff.json()).toMatchObject({ diff: expect.stringContaining("+Final") });
  expect(download.status).toBe(200);
  expect(await download.text()).toBe("Final");
});
