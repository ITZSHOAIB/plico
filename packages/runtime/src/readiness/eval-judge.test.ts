import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkReadiness } from "../index.js";

afterEach(() => vi.unstubAllEnvs());

async function project(config: string, cases: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-judge-readiness-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    `export default { schemaVersion: 1, name: "Demo"${config} };`,
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  for (const [file, text] of Object.entries(cases))
    await writeFile(join(root, "evals", file), text);
  return root;
}

async function judgeMessages(root: string): Promise<string[]> {
  const report = await checkReadiness(root, { databasePath: join(root, "state.sqlite") });
  return report.diagnostics.filter((d) => d.subsystem === "evals.judge").map((d) => d.message);
}

const judged = { "vpn.md": "---\ninput: hi\n---\n- Polite\n" };

describe("evals.judge readiness", { timeout: 30_000 }, () => {
  it("says nothing when no case is judged", async () => {
    expect(await judgeMessages(await project("", { "a.md": "---\ninput: hi\n---\n" }))).toEqual([]);
  });

  it("warns when judged cases have no judge model", async () => {
    expect(await judgeMessages(await project("", judged))).toEqual([
      expect.stringContaining("Set evals.judge"),
    ]);
  });

  it("warns when the judge is the agent's own model or lacks its credential", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const root = await project(', model: { provider: "openai", name: "gpt-5" }', judged);

    expect(await judgeMessages(root)).toEqual([
      "Set OPENAI_API_KEY to run the judge openai:gpt-5.",
      expect.stringContaining("is the agent's own model"),
    ]);
  });

  it("is ok with a separate judge that has its credential", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const root = await project(
      ', model: { provider: "openai", name: "gpt-5" }, evals: { judge: "openai:gpt-5-mini" }',
      judged,
    );

    expect(await judgeMessages(root)).toEqual(["Judged eval checks have a judge model."]);
  });
});
