import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-eval-cases-"));
  for (const dir of ["skills", "tools", "evals/scorers", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Eval Agent" };',
  );
  await writeFile(join(root, "agent.md"), "# Eval Agent\n\nHelp with internal operations.\n");
  for (const [file, text] of Object.entries(files))
    await writeFile(join(root, "evals", file), text);
  return root;
}

const fixture = '[{ "type": "assistant.output", "content": "Hi" }]';

describe("Markdown eval cases", () => {
  it("accepts a case with every frontmatter key and criteria bullets", async () => {
    const root = await project({
      "triage.md": `---
input:
  ticket: VPN is down
expect:
  status: completed
  contains: VPN
  tool: [create_ticket]
  notTool: send_email
  artifact: report.md
  maxTokens: 4000
  maxLatencyMs: 30000
  output:
    priority: high
mocks:
  create_ticket: { id: T-1 }
trials: 3
tags: [regression]
judge: openai:gpt-5-mini
scorers: [no-pii, { use: tone, threshold: 0.8 }]
---
- Explains why the priority is high
`,
      "triage.script.json": fixture,
      "scorers/no-pii.ts": "export default {};",
      "scorers/tone.ts": "export default {};",
    });

    const result = await validateProject(root);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("points at the line of an unknown expect key", async () => {
    const root = await project({
      "typo.md": "---\nexpect:\n  status: completed\n  contian: VPN\n---\n",
      "typo.script.json": fixture,
    });

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ path: "evals/typo.md", line: 4, severity: "error" }),
    ]);
    expect(result.errors[0]?.message).toContain('"expect.contian"');
  });

  it("rejects wrong value types with their line", async () => {
    const root = await project({
      "bad.md": "---\ntrials: 0\nexpect:\n  status: done\n  maxTokens: lots\nmocks: [a]\n---\n",
      "bad.script.json": fixture,
    });

    const lines = (await validateProject(root)).errors.map((e) => [e.line, e.message]);

    expect(lines).toEqual([
      [2, expect.stringContaining("trials")],
      [4, expect.stringContaining("status")],
      [5, expect.stringContaining("maxTokens")],
      [6, expect.stringContaining("mocks")],
    ]);
  });

  it("reports invalid YAML at its line", async () => {
    const root = await project({ "broken.md": "---\nexpect:\n  status: [completed\n---\n" });

    const [error] = (await validateProject(root)).errors;

    expect(error).toMatchObject({ path: "evals/broken.md", severity: "error" });
    expect(error?.line).toBeGreaterThanOrEqual(3);
  });

  it("rejects a scorer with no file in evals/scorers/", async () => {
    const root = await project({
      "case.md": "---\nscorers:\n  - no-pii\n---\n",
      "case.script.json": fixture,
    });

    const result = await validateProject(root);

    expect(result.errors).toEqual([expect.objectContaining({ path: "evals/case.md", line: 3 })]);
    expect(result.errors[0]?.message).toContain("evals/scorers/no-pii.ts");
  });

  it("warns that a case without a fixture runs only with --live", async () => {
    const root = await project({ "live-only.md": "---\nexpect:\n  status: completed\n---\n" });

    const result = await validateProject(root);

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ path: "evals/live-only.md", severity: "warning" }),
    ]);
    expect(result.warnings[0]?.message).toContain("--live");
  });

  it("warns about a Markdown file without frontmatter instead of running it", async () => {
    const root = await project({ "notes.md": "Some notes.\n" });

    const result = await validateProject(root);

    expect(result.warnings.map((w) => w.path)).toEqual(["evals/notes.md"]);
    expect(result.warnings[0]?.message).toContain("frontmatter");
  });
  it("rejects a scorer name that is not a plain file name", async () => {
    const root = await project({
      "case.md": "---\nscorers: [../escape]\n---\n",
      "case.script.json": fixture,
    });

    const [error] = (await validateProject(root)).errors;

    expect(error).toMatchObject({ path: "evals/case.md", line: 2 });
    expect(error?.message).toContain("plain name");
  });

  it("accepts rubric and factuality scorers with their own threshold and judge", async () => {
    const root = await project({
      "graded.md": `---
scorers:
  - rubric:
      0: Ignores the outage
      1: Names the outage
      2: Names the outage and a workaround
    threshold: 0.5
    judge: openai:gpt-5-mini
  - factuality: The VPN is down until 5pm.
---
`,
      "graded.script.json": fixture,
    });

    const result = await validateProject(root);

    expect(result.errors).toEqual([]);
  });

  it("rejects a rubric whose levels do not run from 0 without gaps", async () => {
    const root = await project({
      "gaps.md": "---\nscorers:\n  - rubric: { 0: Bad, 2: Good }\n  - factuality: ''\n---\n",
      "gaps.script.json": fixture,
    });

    const messages = (await validateProject(root)).errors.map((e) => [e.line, e.message]);

    expect(messages).toEqual([
      [3, expect.stringContaining("levels 0, 1")],
      [4, expect.stringContaining("factuality")],
    ]);
  });

  it("checks input against the agent's input schema at the line of input", async () => {
    const root = await project({
      "typed.md": "---\nexpect:\n  status: completed\ninput:\n  ticket: 7\n---\n",
      "typed.script.json": fixture,
    });
    await writeFile(
      join(root, "agent.md"),
      "---\ninput:\n  type: object\n  properties:\n    ticket: { type: string }\n  required: [ticket]\n---\n# Eval Agent\n",
    );

    const [error] = (await validateProject(root)).errors;

    expect(error).toMatchObject({ path: "evals/typed.md", line: 4, severity: "error" });
    expect(error?.message).toContain("ticket");
  });
});
