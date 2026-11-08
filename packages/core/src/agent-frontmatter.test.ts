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
