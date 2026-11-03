export class ProjectChangedError extends Error {
  constructor(index: number, recorded: string, current: string) {
    super(`Project changed during run: step ${index + 1} was "${recorded}", now "${current}".`);
  }
}
