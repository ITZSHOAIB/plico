// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { FakeEventSource, required } from "./testing/fakeEventSource";
import { openRun, otherRun, runEvent, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
  act(() => stream.emit("plico.event", runEvent(5, "run.completed", {})));
  expect(await screen.findByText("run.completed")).toBeTruthy();
  expect(screen.getByText(/Status: completed/)).toBeTruthy();
  expect(stream.closed).toBe(true);
  vi.useFakeTimers();
  act(() => stream.onerror?.());
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(FakeEventSource.instances).toHaveLength(1);
});

it("visibly reconnects from the last received sequence without duplicating events", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  const first = required(FakeEventSource.instances[0]);
  vi.useFakeTimers();
  const event = runEvent(5, "assistant.output", { content: "hello" });
  act(() => {
    first.onopen?.();
    first.emit("plico.event", event);
    first.onerror?.();
  });
  expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(FakeEventSource.instances).toHaveLength(2);
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
  vi.useFakeTimers();
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
  await act(async () => {
    render(<App />);
  });
  expect(screen.getByRole("button", { name: /run-12345678/ })).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole("button", { name: /run-new-123/ })).toBeTruthy();
});

it("stops the old stream when the user selects another run", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());

  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/runs") {
      const response = await original(input, init);
      return new Response(JSON.stringify([...(await response.json()), otherRun]));
    }
    if (input === `/v1/runs/${otherRun.runId}/events`) return new Response("[]");
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

it("stops and reports a disconnected stream after repeated malformed events", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  vi.useFakeTimers();
  for (let attempt = 0; attempt < 5; attempt++) {
    const source = required(FakeEventSource.instances.at(-1));
    act(() => source.dispatchEvent(new MessageEvent("plico.event", { data: "null" })));
    if (attempt < 4) await act(async () => vi.advanceTimersByTimeAsync(20_000));
  }
  expect(screen.getByText(/disconnected/i)).toBeTruthy();
  const count = FakeEventSource.instances.length;
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(FakeEventSource.instances).toHaveLength(count);
});

it("backs off consecutive failures and resets after a new event", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  vi.useFakeTimers();
  act(() => required(FakeEventSource.instances[0]).onerror?.());
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(FakeEventSource.instances).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(FakeEventSource.instances).toHaveLength(2);
  act(() => required(FakeEventSource.instances[1]).onerror?.());
  await act(async () => vi.advanceTimersByTimeAsync(1999));
  expect(FakeEventSource.instances).toHaveLength(2);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(FakeEventSource.instances).toHaveLength(3);
  act(() => {
    const stream = required(FakeEventSource.instances[2]);
    stream.emit("plico.event", runEvent(5, "assistant.output", { content: "hello" }));
    stream.onerror?.();
  });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(FakeEventSource.instances).toHaveLength(4);
});

it("does not poll the run list while the document is hidden", async () => {
  vi.useFakeTimers();
  const fetchMock = stubApi();
  await act(async () => {
    render(<App />);
  });
  expect(screen.getByRole("button", { name: /run-12345678/ })).toBeTruthy();
  const listCalls = () => fetchMock.mock.calls.filter(([path]) => path === "/v1/runs").length;
  const before = listCalls();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(listCalls()).toBe(before);
  hidden.mockReturnValue(false);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(listCalls()).toBe(before + 1);
  hidden.mockRestore();
});

it("reconnects from the last known event if the stream skips a sequence", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  stubApi();
  render(<App />);
  await openRun();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  const first = required(FakeEventSource.instances[0]);
  vi.useFakeTimers();
  act(() => first.emit("plico.event", runEvent(6, "assistant.output", { content: "later" })));
  expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  expect(screen.queryByText("assistant.output")).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(required(FakeEventSource.instances[1]).url).toContain("after=4");
});
