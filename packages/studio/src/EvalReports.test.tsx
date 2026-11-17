// @vitest-environment jsdom

import type { EvalReportV2 } from "@plico-ai/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { App } from "./App";
import { click, events, json, stubApi } from "./testing/fixtures";

afterEach(cleanup);
const latest: EvalReportV2 = {
  schemaVersion: 2,
  id: "latest",
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
      name: "vpn",
      status: "pass",
      runId: "saved-run",
      runStatus: "completed",
      output: "Ticket created",
      scores: [
        {
          kind: "criterion",
          name: "Helpful",
          score: 1,
          threshold: 1,
          passed: true,
          reason: "Explains the next step",
        },
      ],
      trials: [
        {
          name: "vpn",
          status: "pass",
          runId: "saved-run",
          runStatus: "completed",
          output: "Ticket created",
          scores: [],
          events,
        },
      ],
    },
  ],
};
function setup(report: EvalReportV2 = latest) {
  const fetch = stubApi();
  const original = fetch.getMockImplementation();
  fetch.mockImplementation(async (input, init) =>
    input === "/v1/evals/reports"
      ? json([
          report,
          {
            ...latest,
            id: "older",
            evaluatedAt: "2026-11-16",
            passed: 0,
            failed: 1,
            results: latest.results.map((r) => ({
              ...r,
              status: "fail",
              scores: r.scores?.map((score) => ({ ...score, score: 0.75, passed: false })),
              output: "Old answer",
              trials: r.trials?.map((t) => ({ ...t, output: "Old answer" })),
            })),
          },
        ])
      : original
        ? original(input, init)
        : json({}, 500),
  );
  render(<App />);
}
it("opens saved cases with scores, reasons and a trial transcript", async () => {
  setup();
  click("Evals");
  fireEvent.click(await screen.findByRole("button", { name: /vpn/ }));
  expect(await screen.findByText("Explains the next step")).toBeTruthy();
  expect(screen.getByText("tool.call")).toBeTruthy();
  expect(screen.getByText("Ticket created")).toBeTruthy();
});
it("selects historical reports and compares outputs and scores side by side", async () => {
  setup();
  click("Evals");
  const history = await screen.findByLabelText("Eval report");
  fireEvent.change(history, { target: { value: "older" } });
  fireEvent.click(await screen.findByRole("button", { name: /vpn/ }));
  expect(await screen.findByText("Old answer")).toBeTruthy();
  click("Back to evals");
  fireEvent.change(screen.getByLabelText("Compare with"), { target: { value: "latest" } });
  const comparison = await screen.findByRole("region", { name: "Report comparison" });
  expect(comparison.textContent).toContain("Old answer");
  expect(comparison.textContent).toContain("Ticket created");
  expect(comparison.textContent).toContain("Helpful");
  expect(comparison.textContent).toContain("Delta");
  expect(comparison.textContent).toContain("0.250");
});
it("shows the completed trials of an interrupted case without marking it as passed", async () => {
  setup({
    ...latest,
    total: 0,
    passed: 0,
    results: [],
    tokenCapReached: true,
    skipped: [
      {
        name: "interrupted",
        reason: "Token cap reached after 1 of 2 trials",
        completedTrials: latest.results[0]?.trials ?? [],
      },
    ],
  });
  click("Evals");
  const skipped = await screen.findByText(/SKIP interrupted/);
  fireEvent.click(skipped);
  expect(await screen.findByText("Ticket created")).toBeTruthy();
  expect(screen.getByText("tool.call")).toBeTruthy();
  expect(screen.getByText("Token cap reached. This report is incomplete.")).toBeTruthy();
});
