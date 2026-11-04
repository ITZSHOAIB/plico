// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { runEvent } from "../testing/fixtures";
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
  expect(screen.getByText(/Status: waiting/)).toBeTruthy();
  expect(screen.getByText("Not ended")).toBeTruthy();
});

it("shows a failed run's reason without expanding its events", () => {
  render(<RunView selectedRun={{ ...run, status: "failed", endedAt: "end" }} events={[failure]} />);
  expect(screen.getByText(/Disk failed/)).toBeTruthy();
});

it("shows provider output and token usage from visible native events", () => {
  const events = [
    runEvent(1, "model.request", { messages: [], maxSteps: 3, tools: [] }),
    runEvent(2, "model.response", {
      content: "Hello",
      usage: { inputTokens: 12, outputTokens: 4 },
    }),
    runEvent(3, "assistant.output", { content: "Hello" }),
  ];
  render(<RunView selectedRun={{ ...run, status: "completed" }} events={events} />);
  expect(screen.getByText(/12 input tokens/)).toBeTruthy();
  expect(screen.getByText(/4 output tokens/)).toBeTruthy();
  expect(screen.getByText("Hello")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  expect(screen.queryByText("Hello")).toBeNull();
  expect(screen.getByText(/12 input tokens/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  expect(screen.queryByText(/12 input tokens/)).toBeNull();
});
