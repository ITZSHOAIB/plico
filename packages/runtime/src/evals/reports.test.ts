import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readEvalReport, rescoreEvalReport, runEvals } from "../index.js";

it("saves a versioned report file with the transcript, scores and scripted mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-report-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await writeFile(
    join(root, "evals", "hello.script.json"),
    JSON.stringify([{ type: "assistant.output", content: "Hello" }]),
  );
  const summary = await runEvals(root);
  const report = JSON.parse(
    await readFile(join(root, ".plico", "evals", `${summary.reportId}.json`), "utf8"),
  );
  expect(report).toMatchObject({
    schemaVersion: 2,
    id: summary.reportId,
    mode: "scripted",
    passed: 1,
  });
  expect(report.results[0].trials[0]).toMatchObject({
    output: "Hello",
    status: "pass",
    scores: [],
  });
  expect(report.results[0].trials[0].events.length).toBeGreaterThan(0);
});

import type { EvalReportV2 } from "@plico-ai/contracts";
import { compareEvalReports } from "../index.js";

const baseline: EvalReportV2 = {
  schemaVersion: 2,
  id: "base",
  mode: "live",
  evaluatedAt: "2026-11-17",
  fixturesDigest: "same",
  total: 1,
  passed: 1,
  failed: 0,
  skipped: [],
  tokenCapReached: false,
  results: [
    {
      name: "hello",
      status: "pass",
      runId: "a",
      runStatus: "completed",
      scores: [{ kind: "rubric", name: "quality", score: 0.9, threshold: 0.7, passed: true }],
    },
  ],
};
it("compares a case's scores against tolerance and flags missing cases", () => {
  const [before] = baseline.results;
  const [score] = before?.scores ?? [];
  if (!before || !score) throw new Error("Missing test baseline");
  const current = {
    ...baseline,
    id: "new",
    results: [{ ...before, scores: [{ ...score, score: 0.8 }] }],
  };
  expect(compareEvalReports(baseline, current, 0.05)).toMatchObject({
    regressed: true,
    cases: [{ name: "hello", deltas: [{ name: "quality", delta: expect.closeTo(-0.1) }] }],
  });
  expect(compareEvalReports(baseline, current, 0.11).regressed).toBe(false);
  expect(compareEvalReports(baseline, { ...current, results: [] }).regressed).toBe(true);
});

import { expect, it } from "vitest";

it("rescores saved transcripts against changed expectations without rerunning the agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-rescore-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  const fixture = join(root, "evals", "hello.script.json");
  await writeFile(fixture, JSON.stringify([{ type: "assistant.output", content: "Hello" }]));
  const summary = await runEvals(root);
  const original = await readEvalReport(join(root, ".plico", "evals", `${summary.reportId}.json`));
  await writeFile(
    fixture,
    JSON.stringify({
      script: [{ type: "assistant.output", content: "Changed" }],
      expect: { outputContains: "Changed" },
    }),
  );
  const rescored = await rescoreEvalReport(root, original);
  expect(rescored).toMatchObject({
    failed: 1,
    results: [{ output: "Hello", runId: original.results[0]?.runId }],
  });
  expect(rescored.id).not.toBe(original.id);
});

it("readiness warns when the two latest reports use different judges", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-judge-compare-"));
  for (const dir of ["skills", "tools", "evals", "artifacts", "memory"])
    await mkdir(join(root, dir));
  await writeFile(
    join(root, "plico.config.ts"),
    'export default { schemaVersion: 1, name: "Demo" };',
  );
  await writeFile(join(root, "agent.md"), "# Demo");
  await mkdir(join(root, ".plico", "evals"), { recursive: true });
  for (const [id, model] of [
    ["older", "openai:judge-a"],
    ["newer", "openai:judge-b"],
  ]) {
    const report = {
      ...baseline,
      id,
      evaluatedAt: id === "older" ? "2026-11-16" : "2026-11-17",
      results: baseline.results.map((r) => ({
        ...r,
        scores: r.scores?.map((s) => ({ ...s, judge: { model, prompt: "Grade it", raw: "yes" } })),
      })),
    };
    await writeFile(join(root, ".plico", "evals", `${id}.json`), JSON.stringify(report));
  }
  expect((await checkReadiness(root)).diagnostics).toContainEqual(
    expect.objectContaining({ subsystem: "evals.comparison", severity: "warning" }),
  );
});

import { checkReadiness } from "../index.js";

it("ignores unsupported report versions when listing saved reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "plico-report-version-"));
  const dir = join(root, ".plico", "evals");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "current.json"), JSON.stringify(baseline));
  await writeFile(join(dir, "future.json"), JSON.stringify({ schemaVersion: 999 }));
  expect(await listEvalReports(root)).toEqual([baseline]);
  await expect(readEvalReport(join(dir, "future.json"))).rejects.toThrow(
    "Unsupported eval report version",
  );
});

import { listEvalReports } from "../index.js";
