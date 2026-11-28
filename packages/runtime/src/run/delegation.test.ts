import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type ModelProvider,
  type ModelRequest,
  recoverRuns,
  runProject,
} from "../index.js";

async function scaffold(approval = false): Promise<{ root: string; marks: string }> {
  const root = await mkdtemp(join(tmpdir(), "plico-delegation-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  const marks = join(root, "marks.txt");
  await writeFile(marks, "");
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Desk", model: { provider: "openai", name: "big" } } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "---\nagents: [researcher]\n---\nYou answer tickets.\n");
  await writeFile(
    join(root, "agents", "researcher.md"),
    "---\ndescription: Finds facts about a ticket.\nmodel:\n  name: small\ntools: [lookup]\n---\nYou research tickets.\n",
  );
  await writeFile(
    join(root, "tools", "lookup.tool.ts"),
    [
      "export default {",
      '  name: "lookup", description: "Look up a record.",',
      '  inputSchema: { type: "object", properties: {}, additionalProperties: false },',
      `  capabilities: [], approval: { required: ${approval} },`,
      `  handler: async () => { (globalThis as any).__lookup(); return "record 42"; },`,
      "} as const;",
    ].join("\n"),
  );
  (globalThis as { __lookup?: () => void }).__lookup = () => appendFileSync(marks, "lookup\n");
  return { root, marks };
}

/** The supervisor delegates once; the researcher calls lookup once. Each then answers. */
function deskProvider(requests: Array<{ model?: string; request: ModelRequest }>, model?: string) {
  const provider: ModelProvider = {
    async *stream(request) {
      requests.push({ ...(model ? { model } : {}), request });
      const researcher = request.messages[0]?.content.includes("You research");
      const tool = [...request.messages].reverse().find((message) => message.role === "tool");
      if (!tool) {
        yield researcher
          ? { type: "tool.call", call: { id: "c1", name: "lookup", arguments: {} } }
          : {
              type: "tool.call",
              call: { id: "c1", name: "delegate_researcher", arguments: { task: "Find 42" } },
            };
      } else {
        yield {
          type: "text",
          text: researcher ? `Found ${tool.content}` : `Done: ${tool.content}`,
        };
      }
      yield { type: "finish", usage: { inputTokens: 10, outputTokens: 2 } };
    },
  };
  return provider;
}

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition not reached.");
}

describe("delegation", () => {
  it("runs the specialist as a child run and returns its answer to the supervisor", async () => {
    const { root, marks } = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const requests: Array<{ model?: string; request: ModelRequest }> = [];
    const result = await runProject(root, {
      runId: "run-1",
      message: "Ticket 42",
      provider: deskProvider(requests, "big"),
      providerForModel: (model) => deskProvider(requests, model.name),
      eventStore: store,
      engine: createSqliteEngine({ databasePath }),
    });

    expect(result.status).toBe("completed");
    expect(result.output).toContain("Found");
    expect(await readFile(marks, "utf8")).toBe("lookup\n");

    const root1 = await store.getEvents("run-1");
    expect(root1.map((event) => event.type)).toEqual(
      expect.arrayContaining(["agent.called", "agent.returned"]),
    );
    expect(root1[0]?.payload).toMatchObject({ agentId: "main" });
    expect(root1.find((event) => event.type === "agent.returned")?.payload).toMatchObject({
      runId: "run-1.d0-0",
      agentId: "researcher",
      status: "completed",
      output: 'Found "record 42"',
      usage: { inputTokens: 20, outputTokens: 4 },
    });

    const child = await store.getEvents("run-1.d0-0");
    expect(child[0]?.payload).toMatchObject({
      agentId: "researcher",
      parentRunId: "run-1",
      rootRunId: "run-1",
    });
    expect(child[0]?.payload).not.toHaveProperty("threadId");
    expect(child.find((event) => event.type === "input.received")?.payload).toEqual({
      content: "Find 42",
    });
    expect(child.find((event) => event.type === "model.request")?.payload).toMatchObject({
      model: { provider: "openai", name: "small" },
      tools: expect.arrayContaining([expect.objectContaining({ name: "lookup" })]),
    });
    expect(requests.filter((entry) => entry.model === "small")).toHaveLength(2);

    expect(await store.getRun("run-1.d0-0")).toMatchObject({
      status: "completed",
      agentId: "researcher",
      parentRunId: "run-1",
      rootRunId: "run-1",
    });
    expect((await store.listRuns()).map((run) => run.runId)).toEqual(["run-1"]);
    expect((await store.listRuns({ parentRunId: "run-1" })).map((run) => run.runId)).toEqual([
      "run-1.d0-0",
    ]);
  });

  it("waits on a child's approval in the root run and resumes after a restart", async () => {
    const { root, marks } = await scaffold(true);
    const databasePath = join(root, "state.sqlite");
    const options = {
      runId: "run-1",
      message: "Ticket 42",
      provider: deskProvider([]),
      eventStore: createSqliteEventStore({ databasePath }),
      engine: createSqliteEngine({ databasePath }),
    };

    const waiting = await runProject(root, options);
    expect(waiting.status).toBe("waiting");
    const store = createSqliteEventStore({ databasePath });
    expect((await store.getRun("run-1"))?.status).toBe("waiting");
    expect((await store.getRun("run-1.d0-0"))?.status).toBe("waiting");
    const mirrored = (await store.getEvents("run-1")).find(
      (event) => event.type === "approval.requested",
    );
    expect(mirrored?.payload).toMatchObject({
      requestId: "run-1.d0-0:0:0",
      runId: "run-1.d0-0",
      toolName: "lookup",
    });

    const restarted = createSqliteEngine({ databasePath });
    expect(
      await restarted.signal("run-1", "d0-0/approval:run-1.d0-0:0:0", { approved: true }),
    ).toBe("accepted");
    const recovered = await recoverRuns({
      engine: restarted,
      eventStore: store,
      provider: deskProvider([]),
    });

    expect(recovered).toEqual([{ runId: "run-1", state: "completed" }]);
    expect((await store.getRun("run-1"))?.status).toBe("completed");
    expect((await store.getRun("run-1.d0-0"))?.status).toBe("completed");
    expect(await readFile(marks, "utf8")).toBe("lookup\n");
    expect(
      (await store.getEvents("run-1")).filter((event) => event.type === "approval.decided"),
    ).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ runId: "run-1.d0-0" }) }),
    ]);
  });

  it("cancels every child when the root is cancelled", async () => {
    const { root } = await scaffold(true);
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const engine = createSqliteEngine({ databasePath });
    await runProject(root, {
      runId: "run-1",
      message: "Ticket 42",
      provider: deskProvider([]),
      eventStore: store,
      engine,
    });

    expect(await engine.cancel("run-1")).toBe("accepted");
    await until(async () => (await store.getRun("run-1"))?.status === "cancelled");

    expect((await store.getRun("run-1.d0-0"))?.status).toBe("cancelled");
    expect(
      (await store.getEvents("run-1")).find((event) => event.type === "agent.returned")?.payload,
    ).toMatchObject({ status: "cancelled" });
  });

  it("stops delegating once the budget is spent", async () => {
    const { root } = await scaffold();
    await writeFile(
      join(root, "agent.md"),
      "---\nagents: [researcher]\nmaxDelegations: 1\n---\nYou answer tickets.\n",
    );
    let turn = 0;
    const provider: ModelProvider = {
      async *stream(request) {
        const researcher = request.messages[0]?.content.includes("You research");
        if (researcher) yield { type: "text", text: "Found it" };
        else if (turn++ < 2)
          yield {
            type: "tool.call",
            call: { name: "delegate_researcher", arguments: { task: `Find ${turn}` } },
          };
        else yield { type: "text", text: "Done" };
        yield { type: "finish", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    const result = await runProject(root, { message: "Ticket", provider });

    const results = result.events.filter((event) => event.type === "tool.result");
    expect(results.map((event) => event.payload.result)).toEqual([
      { output: "Found it" },
      { error: expect.stringContaining("Delegation budget reached") },
    ]);
  });

  it("replays a scripted delegation with the specialist's own script", async () => {
    const { root, marks } = await scaffold();
    const result = await runProject(root, {
      script: [
        {
          type: "tool.call",
          toolName: "delegate_researcher",
          arguments: { task: "Find 42" },
          script: [
            { type: "tool.call", toolName: "lookup", arguments: {} },
            { type: "assistant.output", content: "Record 42 is open." },
          ],
        },
        { type: "assistant.output", content: "Ticket 42 is open." },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.events.find((event) => event.type === "tool.result")?.payload).toEqual({
      toolName: "delegate_researcher",
      result: { output: "Record 42 is open." },
    });
    expect(await readFile(marks, "utf8")).toBe("lookup\n");
  });
});
