import { useEffect, useState } from "react";
import type { PlicoEvent } from "../types";

export interface StreamTarget {
  runId: string;
  after: number;
}
export type StreamState = "connecting" | "connected" | "reconnecting" | "finished" | null;

export function useRunStream(
  target: StreamTarget | null,
  onEvent: (event: PlicoEvent) => void,
): StreamState {
  const [state, setState] = useState<StreamState>(null);
  useEffect(() => {
    if (!target || typeof EventSource === "undefined") return;
    let cursor = target.after;
    let source: EventSource;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    setState("connecting");
    const connect = () => {
      source = new EventSource(
        `/v1/runs/${encodeURIComponent(target.runId)}/events/stream?after=${cursor}`,
      );
      const connection = source;
      const reconnect = () => {
        if (stopped || source !== connection) return;
        connection.close();
        setState("reconnecting");
        clearTimeout(timer);
        timer = setTimeout(connect, 1000);
      };
      source.onopen = () => {
        if (!stopped && source === connection) setState("connected");
      };
      source.addEventListener("plico.event", (raw) => {
        if (stopped || source !== connection) return;
        let event: PlicoEvent;
        try {
          event = JSON.parse((raw as MessageEvent<string>).data) as PlicoEvent;
        } catch {
          reconnect();
          return;
        }
        if (!event || typeof event !== "object") {
          reconnect();
          return;
        }
        if (
          event.runId !== target.runId ||
          !Number.isSafeInteger(event.sequence) ||
          event.sequence <= cursor
        )
          return;
        if (event.sequence !== cursor + 1) {
          reconnect();
          return;
        }
        cursor = event.sequence;
        onEvent(event);
        if (["run.completed", "run.failed", "run.cancelled"].includes(event.type)) {
          stopped = true;
          source.close();
          setState("finished");
        }
      });
      source.onerror = reconnect;
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source.close();
    };
  }, [target, onEvent]);
  return target ? state : null;
}
