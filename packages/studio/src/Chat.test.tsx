// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { FakeEventSource, required } from "./testing/fakeEventSource";
import { json, runEvent, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

it("reopens an active thread from stored events and resumes after a disconnect", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads") return json([thread]);
    if (input === "/v1/threads/thread-123/messages")
      return json([
        {
          id: "message-1",
          threadId: thread.id,
          role: "user",
          content: "Hello",
          runId: "run-1234567890ab",
          createdAt: thread.createdAt,
        },
      ]);
    if (input === "/v1/runs/run-1234567890ab/events")
      return json([
        runEvent(1, "model.attempt", { turn: 1, attemptId: "a" }),
        runEvent(2, "model.delta", { turn: 1, attemptId: "a", text: "First" }),
      ]);
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "Thread thread-1" }));
  expect(await within(await screen.findByRole("log")).findByText("First")).toBeTruthy();
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  const first = required(FakeEventSource.instances[0]);
  expect(first.url).toContain("after=2");
  vi.useFakeTimers();
  act(() => first.onerror?.());
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  const second = required(FakeEventSource.instances[1]);
  expect(second.url).toContain("after=2");
  act(() =>
    second.emit(
      "plico.event",
      runEvent(3, "model.delta", { turn: 1, attemptId: "a", text: " second" }),
    ),
  );
  expect(within(screen.getByRole("log")).getByText("First second")).toBeTruthy();
});

it("sends a message and displays streaming output and the associated inspector", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  let completed = false;
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads" && init?.method === "POST") return json(thread, 201);
    if (input === "/v1/threads") return json([]);
    if (input === "/v1/threads/thread-123/messages" && init?.method === "POST")
      return json(
        {
          id: "msg-1",
          threadId: thread.id,
          role: "user",
          content: "Hello",
          runId: "run-1234567890ab",
          createdAt: thread.createdAt,
        },
        201,
      );
    if (input === "/v1/threads/thread-123/messages")
      return json([
        {
          id: "old",
          threadId: thread.id,
          role: "user",
          content: "Earlier",
          runId: "old-run",
          createdAt: thread.createdAt,
        },
        ...(completed
          ? [
              {
                id: "msg-1",
                threadId: thread.id,
                role: "user",
                content: "Hello",
                runId: "run-1234567890ab",
                createdAt: thread.createdAt,
              },
              {
                id: "msg-2",
                threadId: thread.id,
                role: "assistant",
                content: "Final answer",
                runId: "run-1234567890ab",
                createdAt: thread.createdAt,
              },
            ]
          : []),
      ]);
    if (input === "/v1/runs/old-run")
      return json({
        runId: "old-run",
        projectRoot: "/demo",
        projectName: "Demo",
        status: "completed",
        startedAt: thread.createdAt,
        endedAt: thread.createdAt,
      });
    if (input === "/v1/runs/old-run/events") return json([]);
    if (input === "/v1/runs/run-1234567890ab/events") return json([]);
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Message" }), {
    target: { value: "Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Hello")).toBeTruthy();
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  const stream = required(FakeEventSource.instances[0]);
  act(() => {
    stream.emit("plico.event", runEvent(1, "model.attempt", { turn: 1, attemptId: "a" }));
    stream.emit(
      "plico.event",
      runEvent(2, "model.delta", { turn: 1, attemptId: "a", text: "Hi there" }),
    );
  });
  expect(await within(screen.getByRole("log")).findByText("Hi there")).toBeTruthy();
  expect(screen.getByText("model.delta")).toBeTruthy();
  act(() => {
    stream.emit("plico.event", runEvent(3, "model.attempt", { turn: 1, attemptId: "b" }));
    stream.emit(
      "plico.event",
      runEvent(4, "model.delta", { turn: 1, attemptId: "b", text: "New attempt" }),
    );
  });
  expect(within(screen.getByRole("log")).queryByText("Hi there")).toBeNull();
  expect(within(screen.getByRole("log")).getByText("New attempt")).toBeTruthy();
  const earlier = screen.getByText("Earlier").closest('[data-slot="message"]');
  if (!earlier) throw new Error("Expected the earlier message");
  fireEvent.click(within(earlier as HTMLElement).getByRole("button", { name: "Inspect run" }));
  expect(await screen.findByText("old-run")).toBeTruthy();
  act(() =>
    stream.emit(
      "plico.event",
      runEvent(5, "model.delta", { turn: 1, attemptId: "b", text: " continues" }),
    ),
  );
  expect(within(screen.getByRole("log")).getByText("New attempt continues")).toBeTruthy();
  completed = true;
  act(() => stream.emit("plico.event", runEvent(6, "run.completed", {})));
  expect(await within(screen.getByRole("log")).findByText("Final answer")).toBeTruthy();
  expect(within(screen.getByRole("log")).queryByText("New attempt continues")).toBeNull();
});

it("creates a thread and displays its persisted messages", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads" && init?.method === "POST") return json(thread, 201);
    if (input === "/v1/threads") return json([]);
    if (input === "/v1/threads/thread-123/messages")
      return json([
        {
          id: "message-1",
          threadId: thread.id,
          role: "user",
          content: "Hello",
          createdAt: thread.createdAt,
        },
      ]);
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  expect(await screen.findByText("Hello")).toBeTruthy();
});

it("keeps the draft and reports the server error when sending fails", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads" && init?.method === "POST") return json(thread, 201);
    if (input === "/v1/threads") return json([]);
    if (input === "/v1/threads/thread-123/messages" && init?.method === "POST")
      return json(
        { error: { message: "Configure a model provider before sending a message." } },
        503,
      );
    if (input === "/v1/threads/thread-123/messages") return json([]);
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  const input = (await screen.findByRole("textbox", { name: "Message" })) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(
    await screen.findByText("Configure a model provider before sending a message."),
  ).toBeTruthy();
  expect(input.value).toBe("Keep this draft");
});

it("shows an error when stopping a reply fails", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads" && init?.method === "POST") return json(thread, 201);
    if (input === "/v1/threads") return json([]);
    if (input === "/v1/threads/thread-123/messages" && init?.method === "POST")
      return json(
        {
          id: "msg-1",
          threadId: thread.id,
          role: "user",
          content: "Hello",
          runId: "run-1234567890ab",
          createdAt: thread.createdAt,
        },
        201,
      );
    if (input === "/v1/threads/thread-123/messages") return json([]);
    if (input === "/v1/runs/run-1234567890ab/events") return json([]);
    if (input === "/v1/runs/run-1234567890ab/cancel")
      return json({ error: { message: "The engine is unavailable." } }, 503);
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Message" }), {
    target: { value: "Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stop response" }));
  expect(await screen.findByText("The engine is unavailable.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Stop response" })).toBeTruthy();
});

it("totals tokens across every run in the selected thread", async () => {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  const thread = { id: "thread-123", createdAt: "2026-01-01T00:00:00Z" };
  const message = (id: string, runId: string) => ({
    id,
    threadId: thread.id,
    role: "user",
    content: "Hello",
    runId,
    createdAt: thread.createdAt,
  });
  const usageEvents = (input: number, output: number) => [
    runEvent(1, "model.response", {
      content: "x",
      usage: { inputTokens: input, outputTokens: output },
    }),
  ];
  fetchMock.mockImplementation(async (input, init) => {
    if (input === "/v1/threads") return json([thread]);
    if (input === "/v1/threads/thread-123/messages")
      return json([message("m1", "run-aaaaaaaaaaaa"), message("m2", "run-bbbbbbbbbbbb")]);
    if (input === "/v1/runs/run-aaaaaaaaaaaa/events") return json(usageEvents(10, 3));
    if (input === "/v1/runs/run-bbbbbbbbbbbb/events") return json(usageEvents(25, 7));
    return original(input, init);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "Thread thread-1" }));

  expect(await screen.findByText(/35 in · 10 out/)).toBeTruthy();
});
