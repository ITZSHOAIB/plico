import type { RequestListener } from "node:http";
import type { PlicoEvent, RunSummary, Thread, ThreadMessage } from "@plico/contracts";
import type {
  DryRunScriptStep,
  Engine,
  EventStore,
  ModelProvider,
  ThreadStore,
} from "@plico/runtime";
import type { MountOptions } from "../mount.js";
import type { Metadata } from "./metadata.js";

/** What the shared layer runs on. Internal: hosts pass a project folder to `createPlico` instead. */
export interface AppDeps {
  projectRoot: string;
  eventStore: EventStore;
  threadStore?: ThreadStore;
  provider?: ModelProvider;
  providerRecoveryKey?: string;
  /** Account-only identity used to resume queued runs after a model change. */
  providerAccountKey?: string;
  engine: Engine;
  /**
   * Set by a mounted handler for one request. New threads and runs carry it as their metadata, and
   * every read and action refuses what it does not match.
   */
  scope?: Metadata;
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
   * Host data passed to tools as `ctx.context` for the run this message starts, and recorded on its
   * `run.started` event. It must not carry secrets.
   */
  context?: Metadata;
}

export interface Plico {
  threads: {
    /** `metadata` is host data kept with the thread, set now and never changed. */
    create(options?: { metadata?: Metadata }): Promise<Thread>;
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
    send(threadId: string, content: string, options?: SendMessageOptions): Promise<ThreadMessage>;
  };
  runs: {
    /**
     * Starts a run that has no thread and no model, running the optional script against the
     * project's tools. Provider-backed runs start through `threads.send`.
     */
    start(options?: {
      script?: DryRunScriptStep[];
      metadata?: Metadata;
      /** Passed to tools as `ctx.context` and recorded on `run.started`. No secrets. */
      context?: Metadata;
    }): Promise<{ runId: string }>;
    get(runId: string): Promise<RunSummary | undefined>;
    /** `metadata` keeps runs whose top-level keys equal every given value. */
    list(filter?: { metadata?: Metadata }): Promise<RunSummary[]>;
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
