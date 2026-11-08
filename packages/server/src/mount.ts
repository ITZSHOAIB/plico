import type { IncomingMessage, RequestListener } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createApi, type ListenerOptions, type RequestData } from "./api.js";
import type { PlicoInternals } from "./app/assemble.js";

/** Options for `plico.fetch()` and `plico.node()`: the API mounted inside a host app. */
export interface MountOptions {
  /**
   * The host's answer to "whose data is this request about", such as `{ userId }`. Plico stamps it
   * on new threads and runs as their metadata, and refuses every read and action on anything it
   * does not match. A client cannot widen it. It also turns off the project-level routes
   * (`/v1/project`, `/v1/instructions`, `/v1/eval`, `/v1/readiness`, `/v1/runs/dry`). A function
   * that throws or returns anything but a JSON object fails the request with a 500.
   */
  scope?: RequestData;
  /**
   * Host data for the runs and approval decisions a request causes: tools read it as `ctx.context`
   * and `run.started` records it. It must not carry secrets.
   */
  context?: RequestData;
  /** The path the API is mounted under when the host does not strip it, such as `/plico`. */
  basePath?: string;
  /** The origin browsers use to reach the host, when it differs from the request URL. */
  publicOrigin?: string;
  /** Accept a `script` on `POST /v1/runs`. Off by default. */
  allowScript?: boolean;
}

function apiOptions(options: MountOptions): ListenerOptions {
  // The host authenticates the request, so the loopback Host rule does not apply.
  return { ...options, allowRemote: true };
}

/** A web-standard handler, for Hono, Next.js route handlers, Bun and Deno. */
export function createFetchHandler(
  internals: PlicoInternals,
  options: MountOptions = {},
): (request: Request) => Promise<Response> {
  const api = createApi(internals, apiOptions(options));
  return async (request) => api.fetch(request);
}

type ParsedBody = { body?: unknown };

/**
 * A Node `(req, res)` handler, for Express, Fastify and plain `http`. A body the host already
 * parsed into `req.body` (such as with `express.json()`) is used instead of the request stream.
 */
export function createNodeHandler(
  internals: PlicoInternals,
  options: MountOptions = {},
): RequestListener {
  const api = createApi(internals, apiOptions(options));
  return getRequestListener(
    (request, env) => {
      const incoming = (env as { incoming?: IncomingMessage & ParsedBody }).incoming;
      return api.fetch(withParsedBody(request, incoming?.body));
    },
    { overrideGlobalObjects: false },
  );
}

function withParsedBody(request: Request, parsed: unknown): Request {
  if (parsed === undefined || request.method === "GET" || request.method === "HEAD") return request;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const body =
    typeof parsed === "string"
      ? parsed
      : parsed instanceof Uint8Array
        ? new TextDecoder().decode(parsed)
        : JSON.stringify(parsed);
  return new Request(request.url, { method: request.method, headers, body });
}
