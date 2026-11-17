import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "./cli.js";

afterEach(() => vi.restoreAllMocks());
it("saves a baseline, detects a regression and emits JUnit and Markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-cli-report-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const fixture = join(root, "evals", "hello.script.json");
  await writeFile(fixture, JSON.stringify([{ type: "assistant.output", content: "Hello" }]));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(
    await main(["node", "plico", "eval", root, "--save-baseline", "--format", "markdown"]),
  ).toBe(0);
  expect(log.mock.calls.flat().join("\n")).toContain("| hello | pass |");
  const baseline = join(root, "evals", "baseline.json");
  expect(JSON.parse(await readFile(baseline, "utf8")).schemaVersion).toBe(2);
  await writeFile(
    fixture,
    JSON.stringify({
      script: [{ type: "assistant.output", content: "Hello" }],
      expect: { outputContains: "Missing" },
    }),
  );
  expect(
    await main(["node", "plico", "eval", root, "--baseline", baseline, "--format", "junit"]),
  ).toBe(1);
  expect(log.mock.calls.flat().join("\n")).toContain('<failure message="Eval failed">');
  expect(await main(["node", "plico", "eval", "rescore", baseline, root])).toBe(1);
});
