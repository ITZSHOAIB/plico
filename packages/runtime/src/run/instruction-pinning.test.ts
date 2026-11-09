import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelProvider,
  type ModelRequest,
  runProject,
} from "../index.js";

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-pinning-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Original instructions\n");
  await mkdir(join(root, "skills", "triage"));
  await writeFile(
    join(root, "skills", "triage", "SKILL.md"),
    "---\ndescription: Original skill.\n---\nOriginal skill body.",
  );
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    [
      "export default {",
      '  name: "archive", description: "Archive a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      "  capabilities: [], approval: { required: true },",
      "  handler: async () => { if (process.env.PLICO_MARKS) (await import('node:fs')).appendFileSync(process.env.PLICO_MARKS, 'original\\n'); return 'archived'; },",
      "} as const;",
    ].join("\n"),
  );
  return root;
}

function recordingProvider(requests: ModelRequest[]): ModelProvider {
  return {
    async *stream(request) {
      requests.push(structuredClone(request));
      const last = request.messages.at(-1);
      if (last?.role === "tool") yield { type: "text", text: "Done" };
      else yield { type: "tool.call", call: { id: "c1", name: "archive", arguments: {} } };
      yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

const system = (request: ModelRequest): string =>
  request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition not reached.");
}

it("keeps a waiting run on the instructions and skills it started with", async () => {
  const root = await scaffold();
  const databasePath = join(root, "state.sqlite");
  const store = createSqliteEventStore({ databasePath });
  const engine = createSqliteEngine({ databasePath });
  const requests: ModelRequest[] = [];
  const provider = recordingProvider(requests);

  const waiting = await runProject(root, {
    runId: "run-1",
    message: "Archive it",
    provider,
    eventStore: store,
    engine,
  });

  expect(waiting.status).toBe("waiting");

  await writeFile(join(root, "agent.md"), "# Edited instructions\n");
  await writeFile(
    join(root, "skills", "triage", "SKILL.md"),
    "---\ndescription: Edited skill.\n---\nEdited skill body.",
  );
  await engine.signal("run-1", "approval:run-1:0:0", { approved: true });
  await until(async () => (await store.getRun("run-1"))?.status === "completed");

  expect(requests.length).toBeGreaterThanOrEqual(2);
  for (const request of requests) {
    expect(system(request)).toContain("Original instructions");
    expect(system(request)).toContain("Original skill.");
    expect(system(request)).not.toContain("Edited");
  }

  const fresh = await runProject(root, {
    runId: "run-2",
    message: "Again",
    provider,
    eventStore: store,
    engine,
  });
  expect(fresh.events.find((e) => e.type === "instructions.composed")?.payload.content).toContain(
    "Edited instructions",
  );
});

function skillReadingProvider(requests: ModelRequest[]): ModelProvider {
  return {
    async *stream(request) {
      requests.push(structuredClone(request));
      const results = request.messages.filter((message) => message.role === "tool").length;
      if (results === 0)
        yield { type: "tool.call", call: { id: "c1", name: "archive", arguments: {} } };
      else if (results === 1)
        yield {
          type: "tool.call",
          call: { id: "c2", name: "load_skill", arguments: { name: "triage" } },
        };
      else yield { type: "text", text: "Done" };
      yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

it("resumes with the recorded instructions and skill when the files are now invalid", async () => {
  const root = await scaffold();
  const databasePath = join(root, "state.sqlite");
  const marks = join(root, "marks.txt");
  await writeFile(marks, "");
  process.env.PLICO_MARKS = marks;
  const store = createSqliteEventStore({ databasePath });
  const engine = createSqliteEngine({ databasePath });
  const requests: ModelRequest[] = [];
  const provider = skillReadingProvider(requests);

  const waiting = await runProject(root, {
    runId: "run-1",
    message: "Archive it",
    provider,
    eventStore: store,
    engine,
  });
  expect(waiting.status).toBe("waiting");

  await writeFile(join(root, "agent.md"), "");
  await writeFile(join(root, "skills", "triage", "SKILL.md"), "No description here.");
  await engine.signal("run-1", "approval:run-1:0:0", { approved: true });
  await until(async () => (await store.getRun("run-1"))?.status === "completed");

  const last = requests
    .at(-1)
    ?.messages.filter((message) => message.role === "tool")
    .at(-1);
  expect(last?.content).toContain("Original skill body.");
  expect(system(requests.at(-1) as ModelRequest)).toContain("Original instructions");
});

it("fails a resumed run before a tool whose code changed while it waited", async () => {
  const root = await scaffold();
  const databasePath = join(root, "state.sqlite");
  const marks = join(root, "marks.txt");
  await writeFile(marks, "");
  process.env.PLICO_MARKS = marks;
  const store = createSqliteEventStore({ databasePath });
  const engine = createSqliteEngine({ databasePath });
  const provider = recordingProvider([]);

  const waiting = await runProject(root, {
    runId: "run-1",
    message: "Archive it",
    provider,
    eventStore: store,
    engine,
  });
  expect(waiting.status).toBe("waiting");

  const tool = join(root, "tools", "archive.tool.ts");
  await writeFile(tool, (await readFile(tool, "utf8")).replace("'original", "'edited"));
  await engine.signal("run-1", "approval:run-1:0:0", { approved: true });
  await until(async () => (await store.getRun("run-1"))?.status === "failed");

  const events = await store.getEvents("run-1");
  expect(events.find((event) => event.type === "run.error")).toMatchObject({
    payload: { message: expect.stringContaining("Project changed during run") },
  });
  expect(await readFile(marks, "utf8")).toBe("");
});
