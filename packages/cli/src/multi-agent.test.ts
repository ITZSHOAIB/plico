import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "./cli.js";

const review = `export default {
  input: { type: "object", required: ["ticket"], properties: { ticket: { type: "string" } } },
  async run({ input, agent }) {
    const draft = await agent("writer", { task: \`Draft \${input.ticket}\` });
    return \`Reviewed: \${draft}\`;
  },
};
`;

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-agents-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Desk" };',
  );
  await writeFile(join(root, "agent.md"), "You answer tickets.\n");
  await writeFile(join(root, "agents", "writer.md"), "You write replies.\n");
  await writeFile(join(root, "workflows", "review.ts"), review);
  await writeFile(
    join(root, "script.json"),
    JSON.stringify([
      {
        type: "agent.call",
        agentId: "writer",
        script: [{ type: "assistant.output", content: "draft" }],
      },
    ]),
  );
  return root;
}

afterEach(() => vi.restoreAllMocks());

it("runs a selected workflow, lists it, and refuses to cancel its child run", async () => {
  const root = await project();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const script = join(root, "script.json");

  const ran = await main(
    ["node", "plico", "run", "--dry", "--persist", "--json", "--workflow", "review"].concat([
      "--input",
      '{"ticket":"T-1"}',
      "--script",
      script,
      root,
    ]),
  );
  expect(ran).toBe(0);
  const result = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as {
    runId: string;
    output: string;
  };
  expect(result.output).toBe("Reviewed: draft");

  log.mockClear();
  await main(["node", "plico", "runs", root]);
  expect(log.mock.calls.flat().join("\n")).toContain("workflow review");

  log.mockClear();
  await main(["node", "plico", "runs", "--json", "--parent", result.runId, root]);
  const children = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Array<{
    runId: string;
    agentId: string;
  }>;
  expect(children).toEqual([expect.objectContaining({ agentId: "writer" })]);

  const cancelled = await main(["node", "plico", "cancel", children[0]?.runId ?? "", root]);
  expect(cancelled).toBe(1);
  expect(error.mock.calls.flat().join("\n")).toContain(`Cancel ${result.runId}`);
});

it("runs a selected agent", async () => {
  const root = await project();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  const code = await main(["node", "plico", "run", "--dry", "--json", "--agent", "writer", root]);

  expect(code).toBe(0);
  const result = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as {
    events: Array<{ type: string; payload: Record<string, unknown> }>;
  };
  expect(result.events[0]?.payload).toMatchObject({ agentId: "writer" });
});

it("dry-runs a workflow whose agent declares an output schema", async () => {
  const root = await project();
  await writeFile(
    join(root, "agents", "reviewer.md"),
    "---\noutput:\n  type: object\n  required: [approved, notes]\n  properties:\n    approved: { type: boolean }\n    notes: { type: string }\n---\nYou review.\n",
  );
  await writeFile(
    join(root, "workflows", "check.ts"),
    'export default { async run({ agent }) { const v = await agent("reviewer", { task: "Check", output: { type: "object", required: ["approved", "notes"], properties: { approved: { type: "boolean" }, notes: { type: "string" } } } }); return JSON.stringify(v); } };\n',
  );
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  const code = await main(["node", "plico", "run", "--dry", "--json", "--workflow", "check", root]);

  expect(code).toBe(0);
  const result = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { output: string };
  expect(JSON.parse(result.output)).toEqual({ approved: true, notes: "stub" });
}, 30_000);
