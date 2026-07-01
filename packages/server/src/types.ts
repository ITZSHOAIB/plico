import type { RequestListener } from "node:http";
import type { EventStore } from "@plico/runtime";

export interface CreatePlicoServerOptions {
  projectRoot: string;
  eventStore: EventStore;
}

export interface ServePlicoOptions {
  projectRoot: string;
  databasePath: string;
  host?: string;
  port?: number;
}

export interface PlicoServer {
  requestListener: RequestListener;
}
