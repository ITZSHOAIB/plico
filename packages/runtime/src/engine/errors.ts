export class ProjectChangedError extends Error {
  constructor(what: "step" | "event", index: number, recorded: string, current: string) {
    super(`Project changed during run: ${what} ${index + 1} was "${recorded}", now "${current}".`);
  }
}

/** Thrown by `ctx.wait` when the run must stop and wait. Not a failure. */
export class RunSuspended extends Error {
  constructor(readonly waitName: string) {
    super(`Run is waiting for ${waitName}.`);
  }
}

/** Thrown by `ctx.step` and `ctx.wait` once the run is cancelled. Not a failure. */
export class RunCancelled extends Error {
  constructor() {
    super("Run was cancelled.");
  }
}
