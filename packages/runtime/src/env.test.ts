import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { checkReadiness, loadProjectEnv } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function project(env?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-env-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Env", model: { provider: "openai", name: "m" } };',
  );
  await writeFile(join(root, "agent.md"), "# Env\n\nAnswer from the project.\n");
  if (env !== undefined) await writeFile(join(root, ".env"), env);
  return root;
}

it("loads the project .env without overriding variables already set", async () => {
  vi.stubEnv("PLICO_ENV_TEST_NEW", "");
  delete process.env.PLICO_ENV_TEST_NEW;
  vi.stubEnv("PLICO_ENV_TEST_KEPT", "from-shell");
  const root = await project("PLICO_ENV_TEST_NEW=from-file\nPLICO_ENV_TEST_KEPT=from-file\n");

  expect(loadProjectEnv(root)).toBe(join(root, ".env"));

  expect(process.env.PLICO_ENV_TEST_NEW).toBe("from-file");
  expect(process.env.PLICO_ENV_TEST_KEPT).toBe("from-shell");
});

it("does nothing when the project has no .env", async () => {
  expect(loadProjectEnv(await project())).toBeUndefined();
});

it("tells readiness which file was loaded and never shows its values", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  delete process.env.OPENAI_API_KEY;
  const root = await project("OPENAI_API_KEY=sk-super-secret\n");
  loadProjectEnv(root);

  const report = await checkReadiness(root);

  const env = report.diagnostics.find((diagnostic) => diagnostic.subsystem === "env.loaded");
  expect(env?.severity).toBe("ok");
  expect(env?.message).toContain(".env");
  expect(JSON.stringify(report)).not.toContain("sk-super-secret");
});
