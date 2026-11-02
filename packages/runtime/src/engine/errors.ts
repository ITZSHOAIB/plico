export class ProjectChangedError extends Error {
  constructor(what: "step" | "event", index: number, recorded: string, current: string) {
    super(`Project changed during run: ${what} ${index + 1} was "${recorded}", now "${current}".`);
  }
}
