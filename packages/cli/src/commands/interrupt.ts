import type { Engine } from "@plico-ai/runtime";

/** Keep track of the requested and recovered runs until all execution settles. */
export function cancelOnInterrupt(
  engine: Engine,
  runId: string,
): {
  onStarted(): void;
  onRecoveryStarted(id: string): void;
  onRecoverySettled(id: string): void;
  onCompleted(): void;
  dispose(): void;
} {
  const active = new Set<string>();
  let interrupted = false;
  const cancel = (id: string): void => {
    void engine.cancel(id).catch(() => console.error("Could not cancel the run."));
  };
  const track = (id: string): void => {
    active.add(id);
    if (interrupted) cancel(id);
  };
  const onSignal = (): void => {
    interrupted = true;
    for (const id of active) cancel(id);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    onStarted(): void {
      track(runId);
    },
    onRecoveryStarted(id: string): void {
      track(id);
    },
    onRecoverySettled(id: string): void {
      active.delete(id);
    },
    onCompleted(): void {
      active.delete(runId);
    },
    dispose(): void {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
}
