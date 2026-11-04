import { useCallback, useEffect, useRef, useState } from "react";
import {
  createThread,
  fetchRun,
  fetchThreadMessages,
  fetchThreads,
  sendThreadMessage,
} from "../api";
import type { Thread, ThreadMessage } from "../types";
import type { RunInspector } from "./useRunInspector";

export function useChat(inspector: RunInspector) {
  const { clear, selectRun, selectedRun, events } = inspector;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const selection = useRef(0);
  const currentThread = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const loadedTerminal = useRef<string | null>(null);
  const messageRevision = useRef(0);

  useEffect(() => {
    let active = true;
    void fetchThreads().then(
      (result) => {
        if (active)
          setThreads((current) => [
            ...result,
            ...current.filter((thread) => !result.some((item) => item.id === thread.id)),
          ]);
      },
      () => {
        if (active) setError("Could not load threads.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const inspect = useCallback(
    async (runId: string, generation: number) => {
      try {
        const run = await fetchRun(runId);
        if (selection.current === generation) await selectRun(run);
      } catch {
        if (selection.current === generation) setError("Could not load the associated run.");
      }
    },
    [selectRun],
  );

  const chooseThread = useCallback(
    async (threadId: string) => {
      const generation = ++selection.current;
      currentThread.current = threadId;
      loadedTerminal.current = null;
      setSelected(threadId);
      messageRevision.current++;
      setLoading(true);
      setMessages([]);
      setError(null);
      clear();
      try {
        const history = await fetchThreadMessages(threadId);
        if (selection.current !== generation) return;
        setMessages(history);
        const lastRun = [...history].reverse().find((message) => message.runId)?.runId;
        if (lastRun) await inspect(lastRun, generation);
      } catch {
        if (selection.current === generation) setError("Could not load messages.");
      } finally {
        if (selection.current === generation) setLoading(false);
      }
    },
    [clear, inspect],
  );

  const newThread = useCallback(async () => {
    const generation = ++selection.current;
    try {
      const thread = await createThread();
      setThreads((items) => [...items, thread]);
      if (selection.current === generation) await chooseThread(thread.id);
    } catch {
      if (selection.current === generation) setError("Could not create thread.");
    }
  }, [chooseThread]);

  const send = useCallback(
    async (content: string): Promise<boolean> => {
      const threadId = currentThread.current;
      if (!threadId || sendingRef.current || !content.trim()) return false;
      const generation = selection.current;
      sendingRef.current = true;
      setSending(true);
      setError(null);
      try {
        const message = await sendThreadMessage(threadId, content);
        if (selection.current !== generation) return false;
        messageRevision.current++;
        setMessages((items) => [...items, message]);
        if (message.runId) await inspect(message.runId, generation);
        return true;
      } catch (cause) {
        if (selection.current === generation)
          setError(cause instanceof Error ? cause.message : "Could not send message.");
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [inspect],
  );

  useEffect(() => {
    const terminal = events.at(-1);
    if (
      !selected ||
      !selectedRun ||
      !terminal ||
      !["run.completed", "run.failed", "run.cancelled"].includes(terminal.type)
    )
      return;
    if (loadedTerminal.current === selectedRun.runId) return;
    loadedTerminal.current = selectedRun.runId;
    const generation = selection.current;
    const revision = messageRevision.current;
    void fetchThreadMessages(selected).then(
      (history) => {
        if (selection.current === generation && messageRevision.current === revision)
          setMessages(history);
      },
      () => {
        if (selection.current === generation) setError("Could not refresh messages.");
      },
    );
  }, [events, selected, selectedRun]);

  return { threads, selected, messages, error, sending, loading, newThread, chooseThread, send };
}
