import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(evals: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-eval-judge-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Judged", evals: ${evals} };`,
  );
  await writeFile(join(root, "agent.md"), "# Judged\n\nHelp with internal operations.\n");
  return root;
}

describe("evals.judge config", () => {
  it("keeps the judge model", async () => {
    const result = await validateProject(await project('{ judge: "openai:gpt-5-mini" }'));

    expect(result.ok).toBe(true);
    expect(result.project?.config.evals?.judge).toBe("openai:gpt-5-mini");
  });

  it("rejects a judge that is not provider:model", async () => {
    const result = await validateProject(await project('{ judge: "gpt-5-mini" }'));

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("evals.judge");
  });
});
