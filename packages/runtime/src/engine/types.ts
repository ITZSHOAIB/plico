export interface StepOptions {
  /** Extra attempts inside one step. Defaults to 0: the step runs once unless the process dies inside it. */
  retries?: number;
}

export interface StepAttempt {
  /** Zero-based attempt number within this step. */
  attempt: number;
}

export interface RunContext {
  readonly runId: string;
  /**
   * Runs `fn` and records its result. When the run is replayed, the recorded result is returned
   * and `fn` does not run. Results are stored as JSON, so `undefined` properties are dropped.
   * A step runs at least once: a process that dies inside it runs it again on recovery.
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

export interface RecoveredRun {
  runId: string;
  state: "completed" | "failed";
  error?: string;
}

export interface Engine {
  /** Registers the run and begins executing it in the background. */
  start<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<RunHandle<O>>;
  /** Starts the run and waits for its output. */
  run<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<O>;
  /** Continues an unfinished run from its recorded steps, whoever held it. */
  resume<I, O>(runId: string, workflow: Workflow<I, O>): Promise<O>;
  /**
   * Continues every run whose worker died or let its lease run out. `resolve` picks the workflow
   * for a run; return undefined to leave it alone.
   */
  recover<I, O>(
    resolve: (runId: string, input: I) => Workflow<I, O> | undefined,
  ): Promise<RecoveredRun[]>;
  status(runId: string): Promise<ExecutionStatus | undefined>;
}
