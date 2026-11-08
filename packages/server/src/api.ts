import { Hono } from "hono";
import type { PlicoInternals } from "./app/assemble.js";
import type { Metadata } from "./app/metadata.js";
import { readMetadata } from "./app/metadata.js";
import type { AppDeps } from "./app/types.js";
import { errorResponse, HttpError } from "./errors.js";
import { assertTrustedRequest } from "./origin-guard.js";
import { handleRequest } from "./routes/index.js";
import { serveStaticFile } from "./serve-static.js";

/** What a host computes from each request on a mounted API. */
export type RequestData = (
  request: Request,
) => Metadata | undefined | Promise<Metadata | undefined>;

/** The HTTP-only options. A library embedder never sets these. */
export interface ListenerOptions {
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
  /** Computed per request on a mounted API; see `MountOptions`. */
  scope?: RequestData;
  context?: RequestData;
  /** The path the API is mounted under, removed before routing. */
  basePath?: string;
}

/** The `/v1` API, and Studio when `studioPath` is set, over one `Plico`, as a Hono app. */
export function createApi({ deps, stop }: PlicoInternals, options: ListenerOptions = {}): Hono {
  const { studioPath } = options;
  const api = new Hono();

  api.use("*", async (context, next) => {
    try {
      assertTrustedRequest(context.req.raw, {
        allowRemote: options.allowRemote === true,
        publicOrigin: options.publicOrigin,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return errorResponse(error.status, error.code, error.message);
    }
    await next();
  });

  api.all("*", async (context) => {
    const request = withoutBasePath(context.req.raw, options.basePath);
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");
    const route = async () => {
      try {
        return await handleRequest({
          app: await requestDeps(deps, request, options),
          stop,
          studioPath,
          allowScript: options.allowScript === true,
          request,
        });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return errorResponse(error.status, error.code, error.message);
      }
    };

    if (isApiPath || !studioPath) return route();
    return (
      (await serveStaticFile(studioPath, url.pathname)) ??
      (await serveStaticFile(studioPath, "/index.html")) ??
      route()
    );
  });

  return api;
}

/**
 * The deps for one request. A host function that fails or returns something other than a JSON
 * object ends the request: an unreadable scope must never mean "no scope".
 */
async function requestDeps(
  deps: AppDeps,
  request: Request,
  options: ListenerOptions,
): Promise<AppDeps> {
  if (!options.scope && !options.context) return deps;
  try {
    const scope = options.scope ? readMetadata(await options.scope(request), "scope") : undefined;
    if (options.scope && scope === undefined) throw new TypeError("scope must be a JSON object.");
    const context = options.context
      ? readMetadata(await options.context(request), "context")
      : undefined;
    return {
      ...deps,
      ...(scope === undefined ? {} : { scope }),
      ...(context === undefined ? {} : { context }),
    };
  } catch (error) {
    console.error(
      `plico: could not compute scope or context: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new HttpError(500, "server.error", "Internal server error.");
  }
}

function withoutBasePath(request: Request, basePath: string | undefined): Request {
  const prefix = basePath?.replace(/\/+$/, "");
  if (!prefix) return request;
  const url = new URL(request.url);
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return request;
  url.pathname = url.pathname.slice(prefix.length) || "/";
  return new Request(url, request);
}
