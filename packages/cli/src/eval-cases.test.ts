import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-eval-cases-"));
  for (const dir of ["skills", "tools", "evals/scorers", "artifacts", "memory"])
    await mkdir(join(root, dir), { recursive: true });
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" } as const;\n',
  );
  await writeFile(join(root, "agent.md"), "# Demo\n");
  for (const [file, text] of Object.entries(files))
    await writeFile(join(root, "evals", file), text);
  return root;
}

const fixture = '[{ "type": "assistant.output", "content": "All good" }]';

function output(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((call) => String(call[0])).join("\n");
}

describe("Markdown eval cases in the CLI", () => {
  it("prints the file and line of an invalid case in plico validate", async () => {
    const root = await project({
      "typo.md": "---\nexpect:\n  contian: good\n---\n",
      "typo.script.json": fixture,
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "validate", root])).toBe(1);
    expect(output(error)).toContain('evals/typo.md:3: Unknown key "expect.contian"');
  });

  it("runs a case with a scorer written with defineScorer and lists skipped cases", async () => {
    const root = await project({
      "good.md": "---\nexpect:\n  contains: good\nscorers: [upbeat]\n---\n",
      "good.script.json": fixture,
      "live-only.md": "---\nexpect:\n  status: completed\n---\n",
      "scorers/upbeat.ts": `import { defineScorer } from "@plico-ai/sdk";

export default defineScorer({
  name: "upbeat",
  score: ({ output }) => ({ score: output.includes("good") ? 1 : 0 }),
});
`,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(await main(["node", "plico", "eval", "--db", join(root, "s.sqlite"), root])).toBe(0);
    expect(output(log)).toContain("PASS good");
    expect(output(log)).toContain("SKIP live-only: No .script.json fixture; runs with --live.");
    expect(output(log)).toContain("1/1 passed, 0 failed, 1 skipped");
  });
});
