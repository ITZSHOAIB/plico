import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteEngine, createSqliteEventStore, recoverRuns, runProject } from "../index.js";

const script = [
  { type: "assistant.output" as const, content: "Asking first." },
  { type: "tool.call" as const, toolName: "archive", arguments: {} },
  { type: "assistant.output" as const, content: "Archived." },
];

async function scaffold(): Promise<{ root: string; marks: string }> {
  const root = await mkdtemp(join(tmpdir(), "plico-approvals-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  const marks = join(root, "marks.txt");
  await writeFile(marks, "");
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  await writeFile(
    join(root, "tools", "archive.tool.ts"),
    [
      "export default {",
      '  name: "archive", description: "Archive a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      '  capabilities: [], approval: { required: true, reason: "Archiving is permanent." },',
      `  handler: async () => { (globalThis as any).__archive(); return "archived"; },`,
      "} as const;",
    ].join("\n"),
  );
  return { root, marks };
}

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition not reached.");
}

describe("approvals as waits", () => {
  it("holds the gated tool until a decision, then runs it once", async () => {
    const { root, marks } = await scaffold();
    (globalThis as { __archive?: () => void }).__archive = () => appendFileSync(marks, "archive\n");
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const engine = createSqliteEngine({ databasePath });

    const waiting = await runProject(root, { runId: "run-1", script, eventStore: store, engine });

    expect(waiting.status).toBe("waiting");
    expect(waiting.output).toBe("Asking first.");
    expect((await store.getRun("run-1"))?.status).toBe("waiting");
    expect(await readFile(marks, "utf8")).toBe("");

    expect(await engine.signal("run-1", "approval:run-1:1", { approved: true })).toBe("accepted");
    await until(async () => (await store.getRun("run-1"))?.status === "completed");

    expect((await store.getEvents("run-1")).map((event) => event.type)).toEqual([
      "run.started",
      "instructions.composed",
      "tools.discovered",
      "assistant.output",
      "tool.call",
      "approval.requested",
      "run.waiting",
      "tool.result",
      "assistant.output",
      "run.completed",
    ]);
    expect(await readFile(marks, "utf8")).toBe("archive\n");
  });

  it("fails the run when the decision is a denial", async () => {
    const { root, marks } = await scaffold();
    (globalThis as { __archive?: () => void }).__archive = () => appendFileSync(marks, "archive\n");
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const engine = createSqliteEngine({ databasePath });
    await runProject(root, { runId: "run-1", script, eventStore: store, engine });

    await engine.signal("run-1", "approval:run-1:1", { approved: false });
    await until(async () => (await store.getRun("run-1"))?.status === "failed");

    const events = await store.getEvents("run-1");
    expect(events.at(-2)).toMatchObject({
      type: "run.error",
      payload: { phase: "approval", message: "Approval for archive was denied." },
    });
    expect(await readFile(marks, "utf8")).toBe("");
  });

  it("continues in a new process after the decision is stored", async () => {
    const { root, marks } = await scaffold();
    (globalThis as { __archive?: () => void }).__archive = () => appendFileSync(marks, "archive\n");
    const databasePath = join(root, "state.sqlite");
    await runProject(root, {
      runId: "run-1",
      script,
      eventStore: createSqliteEventStore({ databasePath }),
      engine: createSqliteEngine({ databasePath }),
    });

    const store = createSqliteEventStore({ databasePath });
    const restarted = createSqliteEngine({ databasePath });
    await restarted.signal("run-1", "approval:run-1:1", { approved: true });
    const recovered = await recoverRuns({ engine: restarted, eventStore: store });

    expect(recovered).toEqual([{ runId: "run-1", state: "completed" }]);
    expect((await store.getRun("run-1"))?.status).toBe("completed");
    expect(await readFile(marks, "utf8")).toBe("archive\n");
  });
});
