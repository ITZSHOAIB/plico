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
it("compares newly added passing and failing cases through the CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-compare-added-"));
  const before = {
    schemaVersion: 2,
    id: "before",
    mode: "scripted",
    evaluatedAt: "2026-11-17",
    fixturesDigest: "same",
    total: 0,
    passed: 0,
    failed: 0,
    results: [],
    skipped: [],
    tokenCapReached: false,
  };
  const baseline = join(root, "before.json");
  const current = join(root, "after.json");
  await writeFile(baseline, JSON.stringify(before));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const status of ["pass", "fail"]) {
    await writeFile(
      current,
      JSON.stringify({
        ...before,
        id: "after",
        total: 1,
        passed: status === "pass" ? 1 : 0,
        failed: status === "fail" ? 1 : 0,
        results: [{ name: "added", status, runId: "run", runStatus: "completed" }],
      }),
    );
    expect(await main(["node", "plico", "eval", "compare", baseline, current, "--json"])).toBe(
      status === "pass" ? 0 : 1,
    );
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).cases).toContainEqual(
      expect.objectContaining({ name: "added", before: "missing", after: status }),
    );
  }
});

it("prints baseline comparison lines by default and JSON only with --json", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-baseline-output-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await writeFile(
    join(root, "evals", "case.script.json"),
    JSON.stringify([{ type: "assistant.output", content: "ok" }]),
  );
  const before = {
    schemaVersion: 2,
    id: "before",
    mode: "scripted",
    evaluatedAt: "now",
    fixturesDigest: "x",
    total: 1,
    passed: 0,
    failed: 1,
    results: [{ name: "case", status: "fail", runId: "r", runStatus: "failed" }],
    skipped: [],
    tokenCapReached: false,
  };
  const baseline = join(root, "before.json");
  await writeFile(baseline, JSON.stringify(before));
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await main(["node", "plico", "eval", root, "--baseline", baseline]);
  expect(err.mock.calls.flat().join("\n")).toContain("OK case:");
  expect(err.mock.calls.flat().join("\n")).not.toContain('"cases"');
  err.mockClear();
  out.mockClear();
  await main(["node", "plico", "eval", root, "--baseline", baseline, "--json"]);
  expect(err.mock.calls.flat().join("\n")).toContain('"cases"');
});
