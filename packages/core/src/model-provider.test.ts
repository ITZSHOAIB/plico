import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "./index.js";

async function project(model: string, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-model-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Model", model: ${model} };`,
  );
  await writeFile(join(root, "agent.md"), "# Model\n\nHelp with internal operations.\n");
  for (const [file, text] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), text);
  }
  return root;
}

describe("model provider validation", () => {
  it.each([
    "anthropic",
    "google",
    "openai",
    "openai-compatible",
  ])("accepts %s", async (provider) => {
    const root = await project(`{ provider: "${provider}", name: "m" }`);

    expect((await validateProject(root)).ok).toBe(true);
  });

  it("rejects an unknown provider and lists the ones it knows", async () => {
    const result = await validateProject(await project('{ provider: "acme", name: "m" }'));

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toBe("plico.config.ts");
    expect(result.errors[0]?.message).toContain('"acme"');
    expect(result.errors[0]?.message).toContain("anthropic");
    expect(result.errors[0]?.message).toContain("providers/acme.ts");
  });

  it("accepts a provider that the project supplies in providers/", async () => {
    const root = await project('{ provider: "acme", name: "m" }', {
      "providers/acme.ts": "export default () => ({});",
    });

    expect((await validateProject(root)).ok).toBe(true);
  });

  it("accepts baseURL and apiKeyEnv and rejects other types", async () => {
    const good = await project(
      '{ provider: "openai-compatible", name: "m", baseURL: "http://localhost:11434/v1", apiKeyEnv: "OLLAMA_KEY" }',
    );
    const bad = await project('{ provider: "openai-compatible", name: "m", baseURL: 5 }');

    expect((await validateProject(good)).ok).toBe(true);
    expect((await validateProject(bad)).ok).toBe(false);
  });
});
