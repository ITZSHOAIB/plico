// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlicoEvent, RunSummary, Thread } from "../types";
import type { RunInspector } from "./useRunInspector";

vi.mock("../api", () => ({
  createThread: vi.fn(),
  fetchRun: vi.fn(),
  fetchThreadMessages: vi.fn(async () => []),
  fetchThreads: vi.fn(),
  renameThread: vi.fn(),
  sendThreadMessage: vi.fn(),
}));

import * as api from "../api";
import { useChat } from "./useChat";

afterEach(cleanup);

const untitled: Thread = { id: "t1", createdAt: "2026-11-08T00:00:00Z" };

function inspector(events: PlicoEvent[]): RunInspector {
  return {
    clear: () => undefined,
    selectRun: async () => undefined,
    selectedRun: { runId: "run-1", status: "completed" } as RunSummary,
    events,
  } as unknown as RunInspector;
}

it("picks up a title written after the reply finished", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    vi.mocked(api.fetchThreads)
      .mockResolvedValueOnce([untitled])
      .mockResolvedValueOnce([untitled])
      .mockResolvedValue([{ ...untitled, title: "Berlin VPN" }]);
    const { result, rerender } = renderHook(({ events }) => useChat(inspector(events)), {
      initialProps: { events: [] as PlicoEvent[] },
    });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    await act(() => result.current.chooseThread("t1"));

    rerender({ events: [{ id: "e1", type: "run.completed" } as PlicoEvent] });
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(result.current.threads[0]?.title).toBe("Berlin VPN");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a rename when an older thread-list refresh arrives afterwards", async () => {
  let resolveRefresh!: (threads: Thread[]) => void;
  vi.mocked(api.fetchThreads)
    .mockResolvedValueOnce([untitled])
    .mockImplementationOnce(
      () =>
        new Promise<Thread[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
  vi.mocked(api.renameThread).mockResolvedValue({ ...untitled, title: "Berlin VPN" });
  const { result, rerender } = renderHook(({ events }) => useChat(inspector(events)), {
    initialProps: { events: [] as PlicoEvent[] },
  });
  await waitFor(() => expect(result.current.threads).toHaveLength(1));
  await act(() => result.current.chooseThread("t1"));

  // A finished reply starts a refresh that picks up generated titles; it is still in flight.
  rerender({ events: [{ id: "e1", type: "run.completed" } as PlicoEvent] });
  await waitFor(() => expect(resolveRefresh).toBeTypeOf("function"));
  await act(() => result.current.rename("t1", "Berlin VPN"));
  expect(result.current.threads[0]?.title).toBe("Berlin VPN");

  await act(async () => resolveRefresh([untitled]));

  expect(result.current.threads[0]?.title).toBe("Berlin VPN");
});
