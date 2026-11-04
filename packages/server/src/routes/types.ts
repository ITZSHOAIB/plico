import type { IncomingMessage, ServerResponse } from "node:http";
import type { Engine, EventStore, ModelProvider, ThreadStore } from "@plico/runtime";

export interface RouteContext {
  projectRoot: string;
  eventStore: EventStore;
  threadStore: ThreadStore | undefined;
  provider: ModelProvider | undefined;
  providerRecoveryKey: string | undefined;
  /** Account-only identity used to resume queued runs after a model change. */
  providerAccountKey: string | undefined;
  engine: Engine | undefined;
  studioPath: string | undefined;
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  /** Decoded capture groups from the route pattern, in order. */
  params: string[];
}

export interface Route {
  method: "GET" | "POST";
  pattern: RegExp;
  handler: (context: RouteContext) => Promise<void>;
}
