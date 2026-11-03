import { useEffect, useState } from "react";
import type { PlicoEvent } from "../types";
import { isTerminalEvent } from "./runState";

export interface StreamTarget {
  runId: string;
  after: number;
}
export type StreamState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "finished"
  | null;

export const retryBaseMs = 1000;
export const retryMaxMs = 16000;
export const maxStreamFailures = 5;

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
    let failures = 0;
    setState("connecting");
    const connect = () => {
      source = new EventSource(
        `/v1/runs/${encodeURIComponent(target.runId)}/events/stream?after=${cursor}`,
      );
      const connection = source;
      let closed = false;
      const reconnect = () => {
        if (stopped || source !== connection || closed) return;
        closed = true;
        connection.close();
        failures++;
        if (failures >= maxStreamFailures) {
          stopped = true;
          setState("disconnected");
          return;
        }
        setState("reconnecting");
        clearTimeout(timer);
        timer = setTimeout(connect, Math.min(retryMaxMs, retryBaseMs * 2 ** (failures - 1)));
      };
      source.onopen = () => {
        if (!stopped && source === connection) setState("connected");
      };
      source.addEventListener("plico.event", (raw) => {
        if (stopped || source !== connection || closed) return;
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
          event.schemaVersion !== 1 ||
          event.streamType !== "run" ||
          event.streamId !== target.runId ||
          event.runId !== target.runId ||
          typeof event.id !== "string" ||
          typeof event.timestamp !== "string" ||
          !Number.isSafeInteger(event.sequence) ||
          typeof event.type !== "string" ||
          !event.payload ||
          typeof event.payload !== "object"
        ) {
          reconnect();
          return;
        }
        if (event.sequence <= cursor) return;
        if (event.sequence !== cursor + 1) {
          reconnect();
          return;
        }
        cursor = event.sequence;
        failures = 0;
        onEvent(event);
        if (isTerminalEvent(event)) {
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
