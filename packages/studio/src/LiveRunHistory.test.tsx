// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { FakeEventSource, required } from "./testing/fakeEventSource";
import { openRun, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

it("reports when the selected run history could not load", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) =>
    input === "/v1/runs/run-1234567890ab/events"
      ? new Response("unavailable", { status: 500 })
      : original(input, init),
  );
  render(<App />);
  const run = await screen.findByRole("button", { name: /run-12345678/ });
  act(() => run.click());
  expect(await screen.findByText(/could not load run events/i)).toBeTruthy();
});

it("uses a terminal event in loaded history even when the run list is stale", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) => {
    const response = await original(input, init);
    if (input !== "/v1/runs/run-1234567890ab/events") return response;
    const events = await response.json();
    return new Response(
      JSON.stringify([
        ...events,
        {
          schemaVersion: 1,
          streamType: "run",
          streamId: "run-1234567890ab",
          runId: "run-1234567890ab",
          id: "evt-5",
          sequence: 5,
          timestamp: "2026-11-01T00:00:00.000Z",
          type: "run.completed",
          payload: {},
        },
      ]),
    );
  });
  render(<App />);
  await openRun();
  expect(await screen.findByText(/Status: completed/)).toBeTruthy();
  expect(FakeEventSource.instances).toHaveLength(0);
});

it("reconnects from the last known event if the stream skips a sequence", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  const first = FakeEventSource.instances[0];
  if (!first) throw new Error("missing stream");
  act(() =>
    first.emit("plico.event", {
      runId: "run-1234567890ab",
      sequence: 6,
      type: "assistant.output",
      payload: { content: "later" },
    }),
  );
  expect(await screen.findByText(/reconnecting/i)).toBeTruthy();
  expect(screen.queryByText("assistant.output")).toBeNull();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2), { timeout: 3000 });
  expect(FakeEventSource.instances[1]?.url).toContain("after=4");
});

it("ignores an earlier history response after switching runs", async () => {
  const fetchMock = stubApi();
  const original = fetchMock.getMockImplementation();
  if (!original) throw new Error("missing fetch mock");
  const other = {
    runId: "run-other-1234",
    projectRoot: "/demo",
    projectName: "Internal Ops",
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
  };
  let release!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs") {
      const response = await original(input, init);
      return new Response(JSON.stringify([...(await response.json()), other]));
    }
    if (input === "/v1/runs/run-1234567890ab/events") return delayed;
    if (input === `/v1/runs/${other.runId}/events`) return new Response("[]");
    return original(input, init);
  });
  render(<App />);
  const first = await screen.findByRole("button", { name: /run-12345678/ });
  act(() => first.click());
  act(() => screen.getByRole("button", { name: /run-other/ }).click());
  await screen.findByText("run-other-1234");
  await act(async () =>
    release(
      new Response(
        JSON.stringify([
          {
            id: "late",
            runId: "run-1234567890ab",
            sequence: 1,
            type: "tool.call",
            payload: { toolName: "wrong" },
          },
        ]),
      ),
    ),
  );
  expect(screen.queryByText("tool.call")).toBeNull();
});

it("shows a wait recorded after the run list was loaded", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) => {
    const response = await original(input, init);
    if (input === "/v1/runs") {
      const runs = await response.json();
      return new Response(
        JSON.stringify(runs.map((run: object) => ({ ...run, status: "running" }))),
      );
    }
    if (input === "/v1/runs/run-1234567890ab/events") {
      const events = await response.json();
      return new Response(
        JSON.stringify([
          ...events,
          {
            schemaVersion: 1,
            streamType: "run",
            streamId: "run-1234567890ab",
            runId: "run-1234567890ab",
            id: "evt-5",
            sequence: 5,
            timestamp: "2026-11-01T00:00:00.000Z",
            type: "run.waiting",
            payload: { requestId: "r", toolName: "tool" },
          },
        ]),
      );
    }
    return response;
  });
  render(<App />);
  await openRun();
  expect(await screen.findByText(/Status: waiting/)).toBeTruthy();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
});
