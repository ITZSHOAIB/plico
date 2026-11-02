// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PlicoEvent, RunSummary } from "../types";
import { RunView } from "./RunView";

afterEach(cleanup);
const run: RunSummary = {
  runId: "run-1",
  projectRoot: "/p",
  projectName: "Demo",
  status: "waiting",
  startedAt: "start",
  endedAt: null,
};
const failure: PlicoEvent = {
  schemaVersion: 1,
  streamType: "run",
  streamId: "run-1",
  runId: "run-1",
  id: "evt-1",
  sequence: 1,
  timestamp: "end",
  type: "run.error",
  payload: { phase: "runtime", message: "Disk failed" },
};

it("shows a waiting run without an end time", () => {
  render(<RunView selectedRun={run} events={[]} />);
  expect(screen.getByText(/Status: waiting/).textContent).toContain("Not ended");
});

it("shows a failed run's reason without expanding its events", () => {
  render(<RunView selectedRun={{ ...run, status: "failed", endedAt: "end" }} events={[failure]} />);
  expect(screen.getByText(/Disk failed/)).toBeTruthy();
});
