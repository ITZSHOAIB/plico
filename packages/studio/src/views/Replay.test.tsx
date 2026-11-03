// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PlicoEvent, RunSummary } from "../types";
import { RunView } from "./RunView";

afterEach(cleanup);
const run: RunSummary = {
  runId: "run-1",
  projectRoot: "/demo",
  projectName: "Demo",
  status: "failed",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:03.000Z",
};
const envelope = {
  schemaVersion: 1 as const,
  streamType: "run" as const,
  streamId: "run-1",
  runId: "run-1",
  timestamp: "2026-01-01T00:00:00.000Z",
};
const events: PlicoEvent[] = [
  {
    ...envelope,
    id: "1",
    sequence: 1,
    type: "run.started",
    payload: { projectRoot: "/demo", projectName: "Demo" },
  },
  {
    ...envelope,
    id: "2",
    sequence: 2,
    type: "run.error",
    payload: { phase: "runtime", message: "Disk failed" },
  },
  {
    ...envelope,
    id: "3",
    sequence: 3,
    type: "run.failed",
    timestamp: "2026-01-01T00:00:03.000Z",
    payload: { phase: "runtime" },
  },
];

it("replays earlier events without showing a future failure", () => {
  render(<RunView selectedRun={run} events={events} />);
  expect(screen.getByText(/Status: failed/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  expect(screen.getByText(/Status: running/)).toBeTruthy();
  expect(screen.queryByText("run.failed")).toBeNull();
  expect(screen.queryByText(/Disk failed/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Go to latest" }));
  expect(screen.getByText(/Status: failed/)).toBeTruthy();
  expect(screen.getByText(/Disk failed/)).toBeTruthy();
});

it("keeps a historical position when a new event arrives", () => {
  const { rerender } = render(
    <RunView
      selectedRun={{ ...run, status: "running", endedAt: null }}
      events={events.slice(0, 2)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  expect(screen.getByText(/Event 1 of 2/)).toBeTruthy();
  rerender(<RunView selectedRun={run} events={events} />);
  expect(screen.getByText(/Event 1 of 3/)).toBeTruthy();
  expect(screen.getByText(/2 newer/)).toBeTruthy();
  expect(screen.queryByText("run.failed")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Go to latest" }));
  expect(screen.getByText("run.failed")).toBeTruthy();
  expect(screen.getByText(/Status: failed/)).toBeTruthy();
});

it("follows new events at the latest position and limits raw output while replaying", () => {
  const { rerender } = render(
    <RunView
      selectedRun={{ ...run, status: "running", endedAt: null }}
      events={events.slice(0, 1)}
    />,
  );
  rerender(<RunView selectedRun={run} events={events} />);
  expect(screen.getByText(/Event 3 of 3/)).toBeTruthy();
  expect(screen.getByText("run.failed")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  fireEvent.click(screen.getByRole("button", { name: "Raw events" }));
  const raw = JSON.parse(screen.getByLabelText("Raw events").textContent ?? "[]");
  expect(raw.map((event: PlicoEvent) => event.type)).toEqual(["run.started", "run.error"]);
  fireEvent.click(screen.getByRole("button", { name: "Next event" }));
  expect(screen.getByText(/Event 3 of 3/)).toBeTruthy();
  expect(screen.getByText(/Status: failed/)).toBeTruthy();
});
