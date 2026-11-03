// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { click, json, openRun, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("opens a snapshot and previews its historical files", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) =>
    input === "/v1/runs/run-1234567890ab/workspace/snapshots/snapshot-1"
      ? json({
          snapshotId: "snapshot-1",
          fileCount: 1,
          createdAt: "2026-01-01",
          files: [{ path: "old.txt", content: "Past content", mimeType: "text/plain", version: 1 }],
        })
      : original(input, init),
  );
  render(<App />);
  await openRun();
  click("Artifacts");
  click(
    await screen
      .findByRole("button", { name: /snapshot-1/ })
      .then((button) => button.textContent ?? ""),
  );
  click(
    await screen
      .findByRole("button", { name: /old\.txt/ })
      .then((button) => button.textContent ?? ""),
  );
  expect(screen.getByText("Past content")).toBeTruthy();
});
