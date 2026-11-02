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
  /**
   * Holds the run until a signal named `name` arrives or the timeout passes. A signal that arrived
   * earlier is used at once. Nothing executes while the run waits: the first time there is nothing
   * to return, this throws RunSuspended. Let it reach the engine, or catch it and return; the engine
   * replays the workflow from its recorded steps once the wait can end. Use a unique name per wait.
   */
  wait<T = unknown>(name: string, options?: WaitOptions): Promise<WaitOutcome<T>>;
}

/** How a run ended for now. A waiting run may carry what the workflow returned before it stopped. */
export type RunOutcome<O> = { state: "completed"; output: O } | { state: "waiting"; output?: O };

/** `ignored`: a decision arrived late, twice, or for a finished run. The first one wins. */
export type SignalResult = "accepted" | "ignored" | "unknown";

export interface WaitOptions {
  /** Ends the wait as a timeout this long after it is first reached. No timeout by default. */
  timeoutMs?: number;
}

/** A timeout is its own outcome, so a caller can tell it from a decision. */
export type WaitOutcome<T> = { kind: "signal"; value: T } | { kind: "timeout" };

export type Workflow<I, O> = (ctx: RunContext, input: I) => Promise<O>;

export interface RunHandle<O> {
  readonly runId: string;
  result(): Promise<RunOutcome<O>>;
}

export type ExecutionState = "running" | "waiting" | "completed" | "failed";

export interface ExecutionStatus {
  state: ExecutionState;
}

export interface RecoveredRun {
  runId: string;
  state: "completed" | "waiting" | "failed";
  error?: string;
}

export interface Engine {
  /** Registers the run and begins executing it in the background. */
  start<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<RunHandle<O>>;
  /** Starts the run and waits until it completes or stops to wait. */
  run<I, O>(runId: string, workflow: Workflow<I, O>, input: I): Promise<RunOutcome<O>>;
  /** Continues an unfinished run from its recorded steps, whoever held it. */
  resume<I, O>(runId: string, workflow: Workflow<I, O>): Promise<RunOutcome<O>>;
  /**
   * Delivers a decision to the wait named `name`. The first signal for a name wins; one that comes
   * after the wait ended changes nothing. A run waiting in this process continues at once; any other
   * continues when `recover` next runs.
   */
  signal(runId: string, name: string, value: unknown): Promise<SignalResult>;
  /**
   * Continues every run whose worker died or let its lease run out, and every waiting run whose
   * wait can now end. `resolve` picks the workflow for a run; return undefined to leave it alone.
   */
  recover<I, O>(
    resolve: (runId: string, input: I) => Workflow<I, O> | undefined,
  ): Promise<RecoveredRun[]>;
  status(runId: string): Promise<ExecutionStatus | undefined>;
}
