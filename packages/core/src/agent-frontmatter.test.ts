import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(agent: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-agent-fm-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Agent" };',
  );
  await writeFile(join(root, "agent.md"), agent);
  return root;
}

const instructions = "# Agent\n\nHelp with internal operations.\n";

describe("agent.md frontmatter", () => {
  it("accepts a project with no frontmatter", async () => {
    const result = await validateProject(await project(instructions));

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on each unknown key and still validates", async () => {
    const result = await validateProject(
      await project(`---\nmodel: fast\ntemperature: 0\n---\n${instructions}`),
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.message)).toEqual([
      expect.stringContaining('"model"'),
      expect.stringContaining('"temperature"'),
    ]);
    expect(result.warnings[0]?.path).toBe("agent.md");
  });

  it("treats frontmatter with no instructions as empty", async () => {
    const result = await validateProject(await project("---\nmodel: fast\n---\n"));

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("must not be empty");
  });
});

describe("agent.md input and output schemas", () => {
  const schema = [
    "output:",
    "  type: object",
    "  required: [summary]",
    "  properties:",
    "    summary:",
    "      type: string",
  ].join("\n");

  it("accepts nested JSON Schema for input and output without warnings", async () => {
    const result = await validateProject(
      await project(`---\ninput:\n  type: object\n${schema}\n---\n${instructions}`),
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects a schema that is not valid JSON Schema, naming the key", async () => {
    const result = await validateProject(
      await project(`---\noutput:\n  type: 12\n---\n${instructions}`),
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ path: "agent.md" });
    expect(result.errors[0]?.message).toContain("output");
  });

  it("rejects frontmatter that is not valid YAML", async () => {
    const result = await validateProject(
      await project(`---\noutput: [unclosed\n---\n${instructions}`),
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("frontmatter");
  });
});

describe("plico.config.ts input and output schemas", () => {
  it("rejects an invalid output schema in the config", async () => {
    const root = await project(instructions);
    await writeFile(
      join(root, "plico.config.ts"),
      'export default { schemaVersion: 1, name: "Agent", output: { type: 12 } };',
    );

    const result = await validateProject(root);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ path: "plico.config.ts" });
    expect(result.errors[0]?.message).toContain("output");
  });
});
