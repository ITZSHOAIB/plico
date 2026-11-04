import type { RequestListener } from "node:http";
import type { Engine, EventStore, ModelProvider, ThreadStore } from "@plico/runtime";

export interface CreatePlicoServerOptions {
  projectRoot: string;
  eventStore: EventStore;
  /** The caller owns this store and closes it after the server is no longer using it. */
  threadStore?: ThreadStore;
  provider?: ModelProvider;
  providerRecoveryKey?: string;
  /** Runs started over HTTP. Defaults to an in-memory engine that does not survive a restart. */
  engine?: Engine;
  studioPath?: string;
}

export interface ServePlicoOptions {
  projectRoot: string;
  databasePath: string;
  host?: string;
  port?: number;
  studioPath?: string;
}

export interface PlicoServer {
  requestListener: RequestListener;
}
