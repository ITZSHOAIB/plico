import type { RequestListener } from "node:http";
import type { JsonValue, PlicoEvent, RunSummary, Thread, ThreadMessage } from "@plico-ai/contracts";
import type {
  DryRunScriptStep,
  Engine,
  EventStore,
  ModelProvider,
  RunProjectOptions,
  ThreadStore,
} from "@plico-ai/runtime";
import type { MountOptions } from "../mount.js";
import type { Metadata } from "./metadata.js";

/** What the shared layer runs on. Internal: hosts pass a project folder to `createPlico` instead. */
export interface AppDeps {
  projectRoot: string;
  eventStore: EventStore;
  threadStore?: ThreadStore;
  provider?: ModelProvider;
  /** Builds the provider for an agent whose `model` differs from the project's. */
  providerForModel?: RunProjectOptions["providerForModel"];
  providerRecoveryKey?: string;
  /** Account-only identity used to resume queued runs after a model change. */
  providerAccountKey?: string;
  engine: Engine;
  /**
   * Set by a mounted handler for one request. New threads and runs carry it as their metadata, and
   * every read and action refuses what it does not match.
   */
  scope?: Metadata;
  /** Inspection only: the HTTP API answers reads and refuses every change. */
  inspect?: true;
  /** Set by a mounted handler for one request: host data for the runs and decisions it causes. */
  context?: Metadata;
}

export interface EventFollowOptions {
  /** Yield events after this sequence number. Defaults to the start of the run. */
  after?: number;
  /** Stops following. The iterator then ends without error. */
  signal?: AbortSignal;
  /** Milliseconds between reads of the event log. Defaults to 2000. */
  pollMs?: number;
}

export interface SendMessageOptions {
  /** Record the message without starting a run. Defaults to true. */
  startRun?: boolean;
  /**
   * Typed input for an agent that declares an `input` schema. It is required then, and refused
   * when the agent declares none. A bad value rejects with `input.invalid`.
   */
  input?: unknown;
  /**
   * Host data passed to tools as `ctx.context` for the run this message starts, and recorded on its
   * `run.started` event. It must not carry secrets.
   */
  context?: Metadata;
}

export interface Plico {
  threads: {
    /**
     * `metadata` is host data kept with the thread, set now and never changed. `agent` binds the
     * thread to a named agent; without it, its runs execute the entry agent.
     */
    create(options?: { metadata?: Metadata; agent?: string }): Promise<Thread>;
    get(threadId: string): Promise<Thread | undefined>;
    /** `metadata` keeps threads whose top-level keys equal every given value. */
    list(filter?: { metadata?: Metadata }): Promise<Thread[]>;
    /** Rejects with `thread.not_found` for an unknown thread. */
    rename(threadId: string, title: string): Promise<Thread>;
    messages(threadId: string): Promise<ThreadMessage[]>;
    /**
     * Records a user message and, unless `startRun` is false, starts the run that answers it. The
     * returned message carries the `runId`. Rejects with `thread.busy` while another run is active.
     */
    send(
      threadId: string,
      content: string | undefined,
      options?: SendMessageOptions,
    ): Promise<ThreadMessage>;
  };
  runs: {
    /**
     * Starts a run that has no thread. `agent` or `workflow` selects what runs; without either,
     * the entry agent runs. A `message` or `input` without a script runs on the configured model
     * and rejects with `provider.unavailable` when there is none. Otherwise no model is called and
     * the optional script plays against the project's tools.
     */
    start(options?: {
      agent?: string;
      workflow?: string;
      message?: string;
      /** Typed input checked against the selected agent's or workflow's `input` schema. */
      input?: JsonValue;
      script?: DryRunScriptStep[];
      metadata?: Metadata;
      /** Passed to tools as `ctx.context` and recorded on `run.started`. No secrets. */
      context?: Metadata;
    }): Promise<{ runId: string }>;
    get(runId: string): Promise<RunSummary | undefined>;
    /**
     * Root runs, newest first. `parentRunId` lists that run's child runs instead. `metadata` keeps
     * runs whose top-level keys equal every given value.
     */
    list(filter?: { metadata?: Metadata; parentRunId?: string }): Promise<RunSummary[]>;
    /** Rejects with `run.child` for a child run: cancel its root, which cancels every child. */
    cancel(runId: string): Promise<string>;
    /** Follows a run's events from a cursor until it reaches a terminal state or is stopped. */
    events(runId: string, options?: EventFollowOptions): AsyncGenerator<PlicoEvent, void, void>;
  };
  approvals: {
    /**
     * Delivers an approval decision to a waiting run. `context` describes who decided and is
     * recorded on `approval.decided`. Returns the engine's signal result.
     */
    decide(
      runId: string,
      requestId: string,
      approved: boolean,
      options?: { context?: Metadata },
    ): Promise<string>;
  };
  /**
   * The `/v1` API as a web-standard handler for Hono, Next.js, Bun and Deno. The host's own
   * authentication runs first; `scope` then keeps each request to its own data.
   */
  fetch(options?: MountOptions): (request: Request) => Promise<Response>;
  /** The `/v1` API as a Node handler for Express, Fastify and `http`. Honours a parsed `req.body`. */
  node(options?: MountOptions): RequestListener;
  /** Stops following events, waits for recovery and closes the stores Plico opened. */
  close(): Promise<void>;
}
