import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  createSqliteThreadStore,
  recoverRuns,
  runProject,
} from "../index.js";

const execFileAsync = promisify(execFile);

it("lets a TypeScript tool write, read, and list staged artifacts through runProject", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-tool-artifacts-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await writeFile(
    join(root, "tools", "report.tool.ts"),
    `export default {
      name: "report", description: "Write a report",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async (_input, { artifacts }) => {
        const write = await artifacts.write("reports/daily.bin", Uint8Array.from([0, 255, 10]), { mimeType: "application/octet-stream" });
        const read = await artifacts.read("reports/daily.bin");
        return { write, bytes: read?.content instanceof Uint8Array ? [...read.content] : [], files: await artifacts.list() };
      },
    };`,
  );

  let requests = 0;
  const run = await runProject(root, {
    runId: "run-artifact-tool",
    eventStore: createSqliteEventStore({ databasePath: join(root, "state.sqlite") }),
    message: "Create a binary report",
    provider: {
      async *stream() {
        requests++;
        if (requests === 1) {
          yield { type: "tool.call", call: { name: "report", arguments: {} } };
        } else {
          yield { type: "text", text: "Created" };
        }
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });

  expect(run.status).toBe("completed");
  expect(requests).toBe(2);
  expect(run.events.map((event) => event.type)).toContain("artifact.file.written");
  const toolResultIndex = run.events.findIndex((event) => event.type === "tool.result");
  const artifactWriteIndex = run.events.findIndex(
    (event) => event.type === "artifact.file.written",
  );
  expect(toolResultIndex).toBeGreaterThan(-1);
  expect(artifactWriteIndex).toBeGreaterThan(toolResultIndex);
  const toolResult = run.events[toolResultIndex];
  expect(toolResult?.type === "tool.result" ? toolResult.payload.result : undefined).toMatchObject({
    write: { path: "reports/daily.bin", version: 1 },
    bytes: [0, 255, 10],
    files: [
      { path: "reports/daily.bin", sizeBytes: 3, mimeType: "application/octet-stream", version: 1 },
    ],
  });
});

it("keeps artifact reads and versions in a thread workspace across runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-artifacts-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await writeFile(
    join(root, "tools", "workspace.tool.ts"),
    `export default {
      name: "workspace", description: "Read or write a report",
      inputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"], additionalProperties: false },
      capabilities: [], approval: { required: false },
      handler: async ({ action }, { artifacts }) => {
        if (action === "write") return artifacts.write("reports/daily.txt", "First version");
        const file = await artifacts.read("reports/daily.txt");
        return { content: file?.content, files: await artifacts.list() };
      },
    };`,
  );
  const databasePath = join(root, "state.sqlite");
  const eventStore = createSqliteEventStore({ databasePath });
  const thread = await createSqliteThreadStore({ databasePath }).createThread();

  const first = await runProject(root, {
    runId: "run-thread-artifact-1",
    threadId: thread.id,
    eventStore,
    script: [{ type: "tool.call", toolName: "workspace", arguments: { action: "write" } }],
  });
  const second = await runProject(root, {
    runId: "run-thread-artifact-2",
    threadId: thread.id,
    eventStore,
    script: [{ type: "tool.call", toolName: "workspace", arguments: { action: "read" } }],
  });
  const resultEvent = second.events.find((event) => event.type === "tool.result");

  expect(first.status).toBe("completed");
  expect(second.status).toBe("completed");
  expect(
    resultEvent?.type === "tool.result" ? resultEvent.payload.result : undefined,
  ).toMatchObject({
    content: "First version",
    files: [{ path: "reports/daily.txt", version: 1, sizeBytes: 13 }],
  });
});

it("replays staged artifact writes after a crash without rerunning the completed tool step", {
  timeout: 30_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-artifact-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const markerPath = join(root, "tool-runs.txt");
  const databasePath = join(root, "state.sqlite");
  await writeFile(markerPath, "");
  const toolSource = [
    'import { appendFileSync } from "node:fs";',
    "export default {",
    '  name: "write", description: "Write a report",',
    '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
    "  capabilities: [], approval: { required: false },",
    '  handler: async (_input, { artifacts }) => { appendFileSync(process.env.PLICO_MARKS, "called\\n"); await artifacts.write("reports/recovered.txt", String(Date.now())); return "saved"; },',
    "};",
  ].join("\n");
  await writeFile(join(root, "tools", "write.tool.ts"), toolSource);

  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const childProgram = [
    `import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};`,
    "const [root, databasePath] = process.argv.slice(1);",
    "const base = createSqliteEventStore({ databasePath });",
    'const store = { ...base, appendEvent: async (event) => { await base.appendEvent(event); if (event.type === "tool.result") process.kill(process.pid, "SIGKILL"); } };',
    'await runProject(root, { runId: "run-artifact-crash", script: [{ type: "tool.call", toolName: "write", arguments: {} }], engine: createSqliteEngine({ databasePath }), eventStore: store });',
  ].join("\n");
  await expect(
    execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", childProgram, root, databasePath],
      { env: { ...process.env, PLICO_MARKS: markerPath } },
    ),
  ).rejects.toThrow();

  const eventStore = createSqliteEventStore({ databasePath });
  const recovered = await recoverRuns({ engine: createSqliteEngine({ databasePath }), eventStore });

  expect(recovered).toEqual([{ runId: "run-artifact-crash", state: "completed" }]);
  expect((await readFile(markerPath, "utf8")).trim().split("\n")).toEqual(["called"]);
  expect((await eventStore.getEvents("run-artifact-crash")).map((event) => event.type)).toEqual([
    "run.started",
    "instructions.composed",
    "tools.discovered",
    "tool.call",
    "tool.result",
    "artifact.workspace.created",
    "artifact.file.written",
    "run.completed",
  ]);
});
