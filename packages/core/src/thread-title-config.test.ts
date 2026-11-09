import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findProjectThreadTitleFile, validateProject } from "./index.js";

async function project(threads: string, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-thread-title-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Titles", threads: ${threads} };`,
  );
  await writeFile(join(root, "agent.md"), "# Titles\n\nHelp with internal operations.\n");
  for (const [file, text] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), text);
  }
  return root;
}

describe("threads.title config", () => {
  it.each(["keywords", "model"])("accepts %s", async (title) => {
    const result = await validateProject(await project(`{ title: "${title}" }`));

    expect(result.ok).toBe(true);
    expect(result.project?.config.threads?.title).toBe(title);
  });

  it("rejects any other value", async () => {
    const result = await validateProject(await project('{ title: "ai" }'));

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("threads.title");
  });

  it("finds the project's title module", async () => {
    const root = await project("{}", { "threads/title.ts": "export default () => 'x';" });

    expect(await findProjectThreadTitleFile(root)).toBe(join(root, "threads", "title.ts"));
    expect(await findProjectThreadTitleFile(await project("{}"))).toBeUndefined();
  });
});
