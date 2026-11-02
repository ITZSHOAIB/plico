export interface StepOptions {
  /** Extra attempts inside one step. Defaults to 0: the step runs once. */
  retries?: number;
}

export interface StepAttempt {
  /** Zero-based attempt number within this step. */
  attempt: number;
}

export interface RunContext {
  readonly runId: string;
  /**
   * Runs `fn` once and records its result. When the run is replayed, the recorded result is returned
   * and `fn` does not run. Results are stored as JSON, so `undefined` properties are dropped.
   */
  step<T>(
    name: string,
    fn: (attempt: StepAttempt) => T | Promise<T>,
    options?: StepOptions,
  ): Promise<T>;
}

export type Workflow<I, O> = (ctx: RunContext, input: I) => Promise<O>;

export interface RunHandle<O> {
  readonly runId: string;
  result(): Promise<O>;
}

export type ExecutionState = "running" | "completed" | "failed";

export interface ExecutionStatus {
  state: ExecutionState;
}

export interface Engine {
  /** Registers the run and begins executing it in the background. */
  start<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<RunHandle<O>>;
  /** Starts the run and waits for its output. */
  run<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<O>;
  /** Continues an unfinished run from its recorded steps. */
  resume<I, O>(runId: string, workflow: Workflow<I, O>): Promise<O>;
  status(runId: string): Promise<ExecutionStatus | undefined>;
}
