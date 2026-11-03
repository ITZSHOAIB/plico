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

it("shows events and the terminal status as a selected run progresses", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  const stream = required(FakeEventSource.instances[0]);
  expect(stream.url).toContain("after=4");
  act(() =>
    stream.emit("plico.event", {
      schemaVersion: 1,
      streamType: "run",
      streamId: "run-1234567890ab",
      runId: "run-1234567890ab",
      id: "evt-5",
      sequence: 5,
      timestamp: "2026-11-01T00:00:00.000Z",
      type: "run.completed",
      payload: {},
    }),
  );
  expect(await screen.findByText("run.completed")).toBeTruthy();
  expect(screen.getByText(/Status: completed/)).toBeTruthy();
  expect(stream.closed).toBe(true);
});

it("visibly reconnects from the last received sequence without duplicating events", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  const first = required(FakeEventSource.instances[0]);
  const event = {
    schemaVersion: 1,
    streamType: "run",
    streamId: "run-1234567890ab",
    runId: "run-1234567890ab",
    id: "evt-5",
    sequence: 5,
    timestamp: "2026-11-01T00:00:00.000Z",
    type: "assistant.output",
    payload: { content: "hello" },
  };
  act(() => {
    first.onopen?.();
    first.emit("plico.event", event);
    first.onerror?.();
  });
  expect(await screen.findByText(/reconnecting/i)).toBeTruthy();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(2), { timeout: 3000 });
  const second = required(FakeEventSource.instances[1]);
  expect(first.closed).toBe(true);
  expect(second.url).toContain("after=5");
  act(() => {
    second.onopen?.();
    second.emit("plico.event", event);
  });
  expect(screen.getAllByText("assistant.output")).toHaveLength(1);
});

it("refreshes the run list when a run starts elsewhere", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  let listReads = 0;
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs" && ++listReads > 1)
      return new Response(
        JSON.stringify([
          {
            runId: "run-new-123456",
            projectRoot: "/demo",
            projectName: "Internal Ops",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: null,
          },
        ]),
      );
    return original(input, init);
  });
  render(<App />);
  expect(await screen.findByRole("button", { name: /run-12345678/ })).toBeTruthy();
  expect(
    await screen.findByRole("button", { name: /run-new-123/ }, { timeout: 6000 }),
  ).toBeTruthy();
}, 10000);

it("stops the old stream when the user selects another run", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const other = {
    runId: "run-other-1234",
    projectRoot: "/demo",
    projectName: "Internal Ops",
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
  };
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs") {
      const response = await original(input, init);
      return new Response(JSON.stringify([...(await response.json()), other]));
    }
    if (input === `/v1/runs/${other.runId}/events`) return new Response("[]");
    return original(input, init);
  });
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  const old = required(FakeEventSource.instances[0]);
  act(() => screen.getByRole("button", { name: /run-other/ }).click());
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(2));
  expect(old.closed).toBe(true);
  act(() =>
    old.emit("plico.event", {
      runId: "run-1234567890ab",
      sequence: 5,
      type: "assistant.output",
      payload: { content: "wrong run" },
    }),
  );
  expect(screen.queryByText("assistant.output")).toBeNull();
  expect(screen.getByText("run-other-1234")).toBeTruthy();
});
