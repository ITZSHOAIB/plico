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
          runId: "run-1234567890ab",
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

it("shows the current workspace after returning from events", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) =>
    input === "/v1/runs/run-1234567890ab/workspace/snapshots/snapshot-1"
      ? json({
          snapshotId: "snapshot-1",
          runId: "run-1234567890ab",
          fileCount: 0,
          createdAt: "2026-01-01",
          files: [],
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
  await screen.findByRole("heading", { name: "Snapshot: snapshot-1" });
  click(/run-12345678/);
  await screen.findByText("tool.call");
  click("Artifacts");
  expect(await screen.findByRole("button", { name: /summary\.md/ })).toBeTruthy();
});

it("shows the current workspace when artifacts are reloaded from a snapshot", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) =>
    input === "/v1/runs/run-1234567890ab/workspace/snapshots/snapshot-1"
      ? json({
          snapshotId: "snapshot-1",
          runId: "run-1234567890ab",
          fileCount: 0,
          createdAt: "2026-01-01",
          files: [],
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
  await screen.findByRole("heading", { name: "Snapshot: snapshot-1" });
  click("Artifacts");
  expect(await screen.findByRole("button", { name: /summary\.md/ })).toBeTruthy();
});
