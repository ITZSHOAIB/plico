import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createSqliteEngine, createSqliteEventStore, recoverRuns } from "../index.js";

const execFileAsync = promisify(execFile);

const script = [
  { type: "tool.call" as const, toolName: "mark", arguments: {} },
  { type: "tool.call" as const, toolName: "die", arguments: {} },
  { type: "assistant.output" as const, content: "finished" },
];

function tool(name: string, body: string): string {
  return [
    "import { appendFileSync } from 'node:fs';",
    "export default {",
    `  name: ${JSON.stringify(name)}, description: "x",`,
    '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
    "  capabilities: [], approval: { required: false },",
    `  handler: async () => { appendFileSync(process.env.PLICO_MARKS, ${JSON.stringify(`${name}\n`)}); ${body} return "ok"; },`,
    "} as const;",
  ].join("\n");
}

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-recovery-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(join(root, "tools", "mark.tool.ts"), tool("mark", ""));
  await writeFile(
    join(root, "tools", "die.tool.ts"),
    tool("die", "if (process.env.PLICO_DIE) process.kill(process.pid, 'SIGKILL');"),
  );
  return root;
}

async function killRunMidTool(root: string, databasePath: string, marks: string): Promise<void> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `
      import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
      const [root, databasePath, script] = process.argv.slice(1);
      await runProject(root, {
        runId: "run-crash",
        script: JSON.parse(script),
        eventStore: createSqliteEventStore({ databasePath }),
        engine: createSqliteEngine({ databasePath }),
      });`;

  await expect(
    execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        program,
        root,
        databasePath,
        JSON.stringify(script),
      ],
      { env: { ...process.env, PLICO_MARKS: marks, PLICO_DIE: "1" } },
    ),
  ).rejects.toThrow();
}

describe("crash recovery", () => {
  it("resumes a killed run where it stopped and repeats only the step that was running", {
    timeout: 30_000,
  }, async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const marks = join(root, "marks.txt");
    await writeFile(marks, "");
    await killRunMidTool(root, databasePath, marks);
    const store = createSqliteEventStore({ databasePath });
    expect((await store.getRun("run-crash"))?.status).toBe("running");

    process.env.PLICO_MARKS = marks;
    let starts = 0;
    const recovered = await recoverRuns({
      onStarted: () => {
        starts += 1;
      },
      engine: createSqliteEngine({ databasePath }),
      eventStore: store,
    });

    expect(starts).toBe(0);
    expect(recovered).toEqual([{ runId: "run-crash", state: "completed" }]);
    expect((await store.getRun("run-crash"))?.status).toBe("completed");
    const events = await store.getEvents("run-crash");
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "tool.call",
      "tool.result",
      "tool.call",
      "tool.result",
      "assistant.output",
      "run.completed",
    ]);
    expect((await readFile(marks, "utf8")).split("\n").filter(Boolean)).toEqual([
      "mark",
      "die",
      "die",
    ]);
  });

  it("fails a killed provider run when recovery has no provider", async () => {
    const root = await scaffold();
    const databasePath = join(root, "provider.sqlite");
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
    const program = `
      import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
      const [root, databasePath] = process.argv.slice(1);
      await runProject(root, { runId: "provider-crash", message: "hello",
        engine: createSqliteEngine({ databasePath }), eventStore: createSqliteEventStore({ databasePath }),
        provider: { async *stream() { process.kill(process.pid, "SIGKILL"); } } });
    `;
    await expect(
      execFileAsync(process.execPath, [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        program,
        root,
        databasePath,
      ]),
    ).rejects.toThrow();
    const store = createSqliteEventStore({ databasePath });
    await recoverRuns({ engine: createSqliteEngine({ databasePath }), eventStore: store });
    expect((await store.getRun("provider-crash"))?.status).toBe("failed");
    const events = await store.getEvents("provider-crash");
    expect(events.at(-2)).toMatchObject({
      type: "run.error",
      payload: { message: expect.stringMatching(/provider/i) },
    });
    expect(events.at(-1)?.type).toBe("run.failed");
  });

  it("fails a recovered run loudly when the project changed under it", {
    timeout: 30_000,
  }, async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const marks = join(root, "marks.txt");
    await writeFile(marks, "");
    await killRunMidTool(root, databasePath, marks);
    await writeFile(join(root, "agent.md"), "# Demo, edited while the run was down\n");
    const store = createSqliteEventStore({ databasePath });

    process.env.PLICO_MARKS = marks;
    const recovered = await recoverRuns({
      engine: createSqliteEngine({ databasePath }),
      eventStore: store,
    });

    expect(recovered).toEqual([{ runId: "run-crash", state: "failed" }]);
    expect((await store.getRun("run-crash"))?.status).toBe("failed");
    const events = await store.getEvents("run-crash");
    expect(events.at(-2)).toMatchObject({
      type: "run.error",
      payload: { message: expect.stringContaining("Project changed during run") },
    });
    expect(events.at(-1)?.type).toBe("run.failed");
    expect((await readFile(marks, "utf8")).split("\n").filter(Boolean)).toEqual(["mark", "die"]);
  });
});

it("keeps interrupted chunks distinguishable from the recovered model attempt", {
  timeout: 30_000,
}, async () => {
  const root = await scaffold();
  const databasePath = join(root, "stream.sqlite");
  const moduleUrl = pathToFileURL(join(process.cwd(), "packages/runtime/src/index.ts")).href;
  const program = `
    import { createSqliteEngine, createSqliteEventStore, runProject } from ${JSON.stringify(moduleUrl)};
    const [root, databasePath] = process.argv.slice(1);
    await runProject(root, { runId: "stream-crash", message: "hello",
      eventStore: createSqliteEventStore({ databasePath }), engine: createSqliteEngine({ databasePath }),
      provider: { async *stream() { yield { type: "text", text: "partial" }; process.kill(process.pid, "SIGKILL"); } } });`;
  await expect(
    execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      program,
      root,
      databasePath,
    ]),
  ).rejects.toThrow();
  const store = createSqliteEventStore({ databasePath });
  const recovered = await recoverRuns({
    eventStore: store,
    engine: createSqliteEngine({ databasePath }),
    provider: {
      async *stream() {
        yield { type: "text", text: "complete" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  expect(recovered).toEqual([{ runId: "stream-crash", state: "completed" }]);
  const events = await store.getEvents("stream-crash");
  const deltas = events.filter((event) => event.type === "model.delta");
  expect(deltas.map((event) => event.payload.text)).toEqual(["partial", "complete"]);
  expect(deltas[0]?.payload.attemptId).not.toBe(deltas[1]?.payload.attemptId);
  expect(events.find((event) => event.type === "model.response")?.payload).toMatchObject({
    attemptId: deltas[1]?.payload.attemptId,
    content: "complete",
  });
});
