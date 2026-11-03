// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { click, openRun, otherRun, runEvent, stubApi } from "./testing/fixtures";

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("run navigation", () => {
  it("enables artifacts only while a run is selected", async () => {
    stubApi();
    render(<App />);
    expect(await screen.findByRole("region", { name: "Project overview" })).toBeTruthy();
    const artifacts = screen.getByRole("button", { name: "Artifacts" });
    expect((artifacts as HTMLButtonElement).disabled).toBe(true);
    await openRun();
    expect(screen.queryByRole("region", { name: "Project overview" })).toBeNull();
    expect(screen.getByText(/Status: waiting/)).toBeTruthy();
    expect((artifacts as HTMLButtonElement).disabled).toBe(false);
    click("Overview");
    expect(screen.getByRole("region", { name: "Project overview" })).toBeTruthy();
    expect(screen.queryByText(/Status: waiting/)).toBeNull();
    expect((artifacts as HTMLButtonElement).disabled).toBe(true);
  });
});

it("opens a different run at its latest event", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs") {
      const response = await original(input, init);
      return new Response(JSON.stringify([...(await response.json()), otherRun]));
    }
    if (input === `/v1/runs/${otherRun.runId}/events`) {
      return new Response(
        JSON.stringify([
          {
            ...runEvent(1, "run.started", { projectRoot: "/demo", projectName: "Demo" }),
            runId: otherRun.runId,
            streamId: otherRun.runId,
          },
        ]),
      );
    }
    return original(input, init);
  });
  render(<App />);
  await openRun();
  click("Previous event");
  expect(screen.getByText(/Event 3 of 4/)).toBeTruthy();
  click(/run-other/);
  expect(await screen.findByText(/Event 1 of 1/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Go to latest" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("returns to the latest event when the selected run is selected again", async () => {
  stubApi();
  render(<App />);
  await openRun();
  click("Previous event");
  expect(screen.getByText(/Event 3 of 4/)).toBeTruthy();
  click(/run-12345678/);
  expect(await screen.findByText(/Event 4 of 4/)).toBeTruthy();
});
