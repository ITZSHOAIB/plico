// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PlicoEvent } from "../types";
import { EventList } from "./EventList";

afterEach(cleanup);

it("lets a user expand and collapse event details", () => {
  const event: PlicoEvent = {
    schemaVersion: 1,
    streamType: "run",
    streamId: "run-1",
    runId: "run-1",
    id: "evt-1",
    sequence: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "tool.call",
    payload: { toolName: "lookup", arguments: { query: "hello" } },
  };
  render(<EventList events={[event]} />);
  const row = screen.getByRole("button", { name: /tool.call.*lookup/ });
  expect(row.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText(/"query"/)).toBeNull();
  fireEvent.click(row);
  expect(row.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(/"query"/)).toBeTruthy();
  fireEvent.click(row);
  expect(row.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText(/"query"/)).toBeNull();
});

it("groups a run of streamed text chunks into one row", () => {
  const delta = (sequence: number, text: string): PlicoEvent => ({
    schemaVersion: 1,
    streamType: "run",
    streamId: "run-1",
    runId: "run-1",
    id: `evt-${sequence}`,
    sequence,
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "model.delta",
    payload: { turn: 1, attemptId: "a", text },
  });
  render(<EventList events={[delta(1, "Hello"), delta(2, " streamed"), delta(3, " world")]} />);
  const rows = screen.getAllByRole("button");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.textContent).toContain("3 chunks");
  expect(rows[0]?.textContent).toContain("Hello streamed world");
});
