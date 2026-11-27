import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSqliteEngine,
  createSqliteEventStore,
  type DryRunScriptStep,
  runProject,
} from "../index.js";

const review = `export default {
  description: "Draft, review and revise a reply.",
  input: { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } },
  maxAgentCalls: 4,
  async run({ input, agent, step }) {
    let draft = await agent("writer", { task: \`Draft a reply to \${input.ticket}\` });
    for (let round = 0; round < 3; round++) {
      const verdict = await agent("reviewer", {
        task: \`Review: \${draft}\`,
        output: { type: "object", required: ["approved"], properties: { approved: { type: "boolean" }, notes: { type: "string" } } },
      });
      if (verdict.approved) break;
      draft = await agent("writer", { task: \`Revise: \${draft}. Notes: \${verdict.notes}\` });
    }
    await step("record", () => draft.length);
    return draft;
  },
};
`;

async function scaffold(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-workflow-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Replies" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "You answer tickets.\n");
  await writeFile(join(root, "agents", "writer.md"), "You write replies.\n");
  await writeFile(join(root, "agents", "reviewer.md"), "You review replies.\n");
  await writeFile(join(root, "workflows", "review.ts"), review);
  return root;
}

const say = (content: string): DryRunScriptStep[] => [{ type: "assistant.output", content }];

describe("workflows", () => {
  it("runs a draft, review and revise loop as child runs", async () => {
    const root = await scaffold();
    const databasePath = join(root, "state.sqlite");
    const store = createSqliteEventStore({ databasePath });
    const result = await runProject(root, {
      runId: "run-1",
      workflow: "review",
      input: { ticket: "T-1" },
      eventStore: store,
      engine: createSqliteEngine({ databasePath }),
      script: [
        { type: "agent.call", agentId: "writer", script: say("Draft one") },
        {
          type: "agent.call",
          agentId: "reviewer",
          script: say('{"approved":false,"notes":"Be kind"}'),
        },
        { type: "agent.call", agentId: "writer", script: say("Draft two") },
        { type: "agent.call", agentId: "reviewer", script: say('{"approved":true}') },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Draft two");
    const events = await store.getEvents("run-1");
    expect(events[0]?.payload).toMatchObject({ workflowId: "review" });
    expect(
      events
        .filter((event) => event.type === "agent.returned")
        .map((event) => [event.payload.runId, event.payload.status]),
    ).toEqual([
      ["run-1.a0-writer", "completed"],
      ["run-1.a1-reviewer", "completed"],
      ["run-1.a2-writer", "completed"],
      ["run-1.a3-reviewer", "completed"],
    ]);
    expect(events.find((event) => event.type === "workflow.step")?.payload).toEqual({
      name: "record",
    });
    expect(await store.getRun("run-1.a1-reviewer")).toMatchObject({
      agentId: "reviewer",
      parentRunId: "run-1",
      structuredOutput: { approved: false, notes: "Be kind" },
    });
  });

  it("fails when the workflow input does not match its schema", async () => {
    const root = await scaffold();
    const result = await runProject(root, { workflow: "review", input: { nope: 1 } });

    expect(result.status).toBe("failed");
    expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
      phase: "input.validation",
    });
  });

  it("fails the run once maxAgentCalls is spent", async () => {
    const root = await scaffold();
    const rejected = say('{"approved":false,"notes":"No"}');
    const result = await runProject(root, {
      workflow: "review",
      input: { ticket: "T-1" },
      script: [
        { type: "agent.call", agentId: "writer", script: say("A") },
        { type: "agent.call", agentId: "reviewer", script: rejected },
        { type: "agent.call", agentId: "writer", script: say("B") },
        { type: "agent.call", agentId: "reviewer", script: rejected },
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.events.find((event) => event.type === "run.error")?.payload).toMatchObject({
      message: expect.stringContaining("Agent call budget reached"),
    });
  });

  it("selects an agent other than main", async () => {
    const root = await scaffold();
    const result = await runProject(root, { agent: "writer", script: say("Hello") });

    expect(result.events[0]?.payload).toMatchObject({ agentId: "writer" });
    expect(
      result.events.find((event) => event.type === "instructions.composed")?.payload,
    ).toMatchObject({ sources: ["agents/writer.md"] });
  });
});
