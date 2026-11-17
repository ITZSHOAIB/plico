// @vitest-environment jsdom
import type { EvalReportV2 } from "@plico-ai/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EvalComparison } from "./EvalComparison";

afterEach(cleanup);
function report(judges: string[]): EvalReportV2 {
  return {
    schemaVersion: 2,
    id: "report",
    mode: "live",
    evaluatedAt: "2026-11-17",
    fixturesDigest: "same",
    total: judges.length,
    passed: judges.length,
    failed: 0,
    skipped: [],
    tokenCapReached: false,
    results: judges.map((model, i) => ({
      name: `case-${i}`,
      status: "pass",
      runId: `run-${i}`,
      runStatus: "completed",
      scores: [
        {
          kind: "criterion",
          name: "Helpful",
          score: 1,
          threshold: 1,
          passed: true,
          judge: { model, prompt: "Grade", raw: "yes" },
        },
      ],
    })),
  };
}
it("warns per matching case and score when judges swap across cases", () => {
  render(
    <EvalComparison
      before={report(["judge-a", "judge-b"])}
      after={report(["judge-b", "judge-a"])}
    />,
  );
  expect(
    within(screen.getByRole("row", { name: /case-0/ })).getByText(/Different judges/),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("row", { name: /case-1/ })).getByText(/Different judges/),
  ).toBeTruthy();
});
it("keeps skipped verdicts and reasons for skipped-to-skipped and skipped-to-completed cases", () => {
  const before = {
    ...report([]),
    skipped: [
      { name: "both", reason: "No input before" },
      { name: "case-0", reason: "Token cap reached" },
    ],
  };
  const after = { ...report(["judge-a"]), skipped: [{ name: "both", reason: "No input after" }] };
  render(<EvalComparison before={before} after={after} />);
  const both = within(screen.getByRole("row", { name: /both/ }));
  expect(both.getByText("SKIP: No input before")).toBeTruthy();
  expect(both.getByText("SKIP: No input after")).toBeTruthy();
  const completed = within(screen.getByRole("row", { name: /case-0/ }));
  expect(completed.getByText("SKIP: Token cap reached")).toBeTruthy();
  expect(completed.getByText("pass")).toBeTruthy();
  expect(screen.queryByText("Missing case")).toBeNull();
});
it("checks judge identities per score within one case", () => {
  const before = report(["judge-a"]);
  const [base] = before.results;
  const [score] = base?.scores ?? [];
  if (!base || !score) throw new Error("Missing test case");
  before.results = [
    {
      ...base,
      scores: [
        score,
        { ...score, name: "Accurate", judge: { model: "judge-b", prompt: "Grade", raw: "yes" } },
      ],
    },
  ];
  const after = {
    ...before,
    results: [
      {
        ...base,
        scores: [
          { ...score, judge: { model: "judge-b", prompt: "Grade", raw: "yes" } },
          { ...score, name: "Accurate" },
        ],
      },
    ],
  };
  render(<EvalComparison before={before} after={after} />);
  expect(
    screen.getByText("Different judges for Helpful; this delta may not be comparable."),
  ).toBeTruthy();
  expect(
    screen.getByText("Different judges for Accurate; this delta may not be comparable."),
  ).toBeTruthy();
});
