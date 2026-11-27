import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(workflows: Record<string, string>, config = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-workflows-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory", "agents", "workflows"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Flows", ${config} };`,
  );
  await writeFile(join(root, "agent.md"), "# Ops\n\nAnswer ops tickets.\n");
  await writeFile(
    join(root, "agents", "reviewer.md"),
    "---\ndescription: Reviews drafts.\n---\nReview the draft.\n",
  );
  for (const [name, text] of Object.entries(workflows))
    await writeFile(join(root, "workflows", name), text);
  return root;
}

const review = `export default {
  description: "Draft and review.",
  maxAgentCalls: 4,
  output: { type: "string" },
  async run({ input, agent }) {
    const draft = await agent("main", { task: String(input) });
    return agent("reviewer", { task: draft });
  },
};
`;

async function errors(root: string): Promise<string[]> {
  return (await validateProject(root)).errors.map((issue) => `${issue.path}: ${issue.message}`);
}

describe("workflow files", () => {
  it("accepts a workflow and lets entry select it", async () => {
    expect(await errors(await project({ "review.ts": review }, 'entry: "review"'))).toEqual([]);
  });

  it("reports unknown agents in agent() calls", async () => {
    const root = await project({ "review.ts": review.replace('"reviewer"', '"critic"') });

    expect(await errors(root)).toEqual([
      'workflows/review.ts: Unknown agent "critic" in agent() call',
    ]);
  });

  it("reports a default export without run, a bad budget and a bad schema", async () => {
    const root = await project({
      "a.ts": "export default { description: 'A' };",
      "b.ts": "export default { maxAgentCalls: 0, run() {} };",
      "c.ts": "export default { output: 12, run() {} };",
      "d.ts": "export default {",
    });

    expect(await errors(root)).toEqual([
      expect.stringContaining("workflows/a.ts: default export needs a run"),
      expect.stringContaining("workflows/b.ts: maxAgentCalls must be a positive integer"),
      expect.stringContaining("workflows/c.ts:"),
      expect.stringContaining("workflows/d.ts: Failed to load workflows/d.ts"),
    ]);
  });

  it("rejects an ID shared by an agent and a workflow", async () => {
    const root = await project({ "reviewer.ts": "export default { run() {} };" });

    expect(await errors(root)).toEqual([
      'workflows/reviewer.ts: ID "reviewer" is used by both an agent and a workflow.',
    ]);
  });
});
