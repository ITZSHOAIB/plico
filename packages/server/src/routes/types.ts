import type { Engine, EventStore, ModelProvider, ThreadStore } from "@plico/runtime";
import type { AppDeps } from "../app/types.js";

export interface RouteContext {
  /** The shared layer the thread and run routes call. */
  app: AppDeps;
  /** Aborts when the host closes Plico, so open event streams end. */
  stop: AbortSignal;
  projectRoot: string;
  eventStore: EventStore;
  threadStore: ThreadStore | undefined;
  provider: ModelProvider | undefined;
  providerRecoveryKey: string | undefined;
  /** Account-only identity used to resume queued runs after a model change. */
  providerAccountKey: string | undefined;
  engine: Engine | undefined;
  studioPath: string | undefined;
  /** Whether a request may carry a `script` that drives project tools without a model. */
  allowScript: boolean;
  request: Request;
  url: URL;
  /** Decoded capture groups from the route pattern, in order. */
  params: string[];
}

export interface Route {
  method: "GET" | "POST" | "PATCH";
  pattern: RegExp;
  /** Project-level routes. A scoped mount does not serve them. */
  hostOnly?: true;
  handler: (context: RouteContext) => Promise<Response>;
}
