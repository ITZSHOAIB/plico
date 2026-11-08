import type { RequestListener } from "node:http";
import { internalsOf } from "./app/assemble.js";
import type { Plico } from "./app/types.js";
import { HttpError, sendError } from "./errors.js";
import { assertTrustedRequest } from "./origin-guard.js";
import { handleRequest } from "./routes/index.js";
import { serveStaticFile } from "./serve-static.js";

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
}

/** Serves the `/v1` API, and Studio when `studioPath` is set, over one `Plico`. */
export function createRequestListener(
  plico: Plico,
  options: ListenerOptions = {},
): RequestListener {
  const { deps, stop } = internalsOf(plico);
  const { studioPath } = options;
  return async (request, response) => {
    try {
      assertTrustedRequest(request, {
        allowRemote: options.allowRemote === true,
        publicOrigin: options.publicOrigin,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      sendError(response, error.status, error.code, error.message);
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const isApiPath = url.pathname === "/health" || url.pathname.startsWith("/v1/");
    const context = {
      app: deps,
      stop,
      studioPath,
      allowScript: options.allowScript === true,
      request,
      response,
    };

    if (isApiPath || !studioPath) {
      await handleRequest(context);
      return;
    }

    const served = await serveStaticFile(studioPath, url.pathname, response);
    if (served) return;
    await serveStaticFile(studioPath, "/index.html", response);
  };
}
