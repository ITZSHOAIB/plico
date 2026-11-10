import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(evalFiles: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-evals-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Eval Agent" };',
  );
  await writeFile(join(root, "agent.md"), "# Eval Agent\n\nHelp with internal operations.\n");
  for (const file of evalFiles) await writeFile(join(root, "evals", file), "[]");
  return root;
}

describe("eval files", () => {
  it("warns about files in evals/ that plico eval would not run", async () => {
    const root = await project(["ok.script.json", "typo.json", "notes.md"]);

    const result = await validateProject(root);

    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.path)).toEqual(["evals/notes.md", "evals/typo.json"]);
    expect(result.warnings[1]?.message).toContain(".script.json");
  });

  it("stays quiet for eval cases, README files and dotfiles", async () => {
    const root = await project(["a.script.json", "README.md", ".gitkeep"]);

    expect((await validateProject(root)).warnings).toEqual([]);
  });
});
