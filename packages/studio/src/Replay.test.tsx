// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { otherRun, runEvent } from "./testing/fixtures";
import type { PlicoEvent, RunSummary } from "./types";
import { RunView } from "./views/RunView";

afterEach(cleanup);
const run: RunSummary = { ...otherRun, status: "failed", endedAt: "2026-01-01T00:00:03.000Z" };
const events: PlicoEvent[] = [
  runEvent(1, "run.started", { projectRoot: "/demo", projectName: "Demo" }),
  runEvent(2, "run.error", { phase: "runtime", message: "Disk failed" }),
  { ...runEvent(3, "run.failed", { phase: "runtime" }), timestamp: "2026-01-01T00:00:03.000Z" },
].map((event) => ({ ...event, runId: run.runId, streamId: run.runId }));

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
  expect(screen.getByRole("status").textContent).toContain("Event 1 of 2");
  expect(screen.getByRole("status").textContent).toContain("1 newer");
  rerender(<RunView selectedRun={run} events={events} />);
  expect(screen.getByText(/Event 1 of 3/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("2 newer");
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

it("shows an empty history without replay controls", () => {
  render(<RunView selectedRun={run} events={[]} />);
  expect(screen.getByText("No events yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Previous event" })).toBeNull();
  expect(screen.queryByText(/Event 0 of 0/)).toBeNull();
});

it("continues following new events after Next reaches the latest event", () => {
  const { rerender } = render(<RunView selectedRun={run} events={events.slice(0, 2)} />);
  fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
  fireEvent.click(screen.getByRole("button", { name: "Next event" }));
  rerender(<RunView selectedRun={run} events={events} />);
  expect(screen.getByText(/Event 3 of 3/)).toBeTruthy();
  expect(screen.getByText("run.failed")).toBeTruthy();
});
