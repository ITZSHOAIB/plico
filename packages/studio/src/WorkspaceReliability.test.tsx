// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { click, json, openRun, otherRun, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a workspace fetch failure instead of claiming no workspace exists", async () => {
  const mock = stubApi();
  const original = required(mock.getMockImplementation());
  mock.mockImplementation(async (input, init) =>
    String(input).endsWith("/workspace") ? json({}, 500) : original(input, init),
  );
  render(<App />);
  await openRun();
  click("Artifacts");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not load artifact workspace",
  );
});

it("ignores an old workspace response after selecting another run", async () => {
  const mock = stubApi();
  const original = required(mock.getMockImplementation());
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs")
      return json([otherRun, { ...otherRun, runId: "run-1234567890ab", status: "waiting" }]);
    if (input === "/v1/runs/run-1234567890ab/workspace") return pending;
    if (input === `/v1/runs/${otherRun.runId}/events`) return json([]);
    if (input === `/v1/runs/${otherRun.runId}/workspace`)
      return json({ workspaceId: "new", files: [], snapshots: [] });
    return original(input, init);
  });
  render(<App />);
  await openRun();
  click("Artifacts");
  click(/run-other/);
  click("Artifacts");
  expect(await screen.findByText("Artifact Workspace: new")).toBeTruthy();
  await act(async () => finish(json({ workspaceId: "old", files: [], snapshots: [] })));
  expect(screen.getByText("Artifact Workspace: new")).toBeTruthy();
});
