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
    timestamp: "now",
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
