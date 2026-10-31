import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "@plico/runtime";

export interface RouteContext {
  projectRoot: string;
  eventStore: EventStore;
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
