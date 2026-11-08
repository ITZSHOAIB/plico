import type { RequestListener } from "node:http";
import type { Engine, EventStore, ModelProvider, ThreadStore } from "@plico/runtime";

export interface CreatePlicoServerOptions {
  projectRoot: string;
  eventStore: EventStore;
  /** The caller owns this store and closes it after the server is no longer using it. */
  threadStore?: ThreadStore;
  provider?: ModelProvider;
  providerRecoveryKey?: string;
  /** Account-only identity used to resume queued runs after a model change. */
  providerAccountKey?: string;
  /** Runs started over HTTP. Defaults to an in-memory engine that does not survive a restart. */
  engine?: Engine;
  studioPath?: string;
  /**
   * Skip the loopback `Host` check. Set it when the server is deliberately reachable under another
   * name, for example behind a host app's own authentication. Cross-origin requests stay refused.
   */
  allowRemote?: boolean;
  /**
   * The origin browsers use to reach this server, such as `https://plico.example` when TLS ends at
   * a proxy. A request `Origin` must match it exactly, scheme and port included. Without it, the
   * scheme of the connection and the `Host` header decide.
   */
  publicOrigin?: string;
  /**
   * Accept a `script` on `POST /v1/runs` and `POST /v1/runs/dry`. A script calls project tool
   * handlers with arguments the caller chooses and skips the model, so it is off by default.
   */
  allowScript?: boolean;
}

export interface ServePlicoOptions {
  projectRoot: string;
  databasePath: string;
  host?: string;
  port?: number;
  studioPath?: string;
  /** See {@link CreatePlicoServerOptions.allowRemote}. */
  allowRemote?: boolean;
  /** See {@link CreatePlicoServerOptions.allowScript}. */
  allowScript?: boolean;
}

export interface PlicoServer {
  requestListener: RequestListener;
  /** Resume interrupted and queued runs for hosts that build the server themselves. */
  recover(): Promise<void>;
}
