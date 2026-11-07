import type { IncomingMessage } from "node:http";
import { isIPv4 } from "node:net";
import { HttpError } from "./errors.js";

/**
 * Keeps a web page in the developer's browser from driving a local Plico server.
 *
 * Plico has no authentication, so a loopback bind is the only protection. A page can still reach
 * it by sending a cross-origin request, or by pointing its own domain at 127.0.0.1 (DNS
 * rebinding). Browsers always send `Origin` on cross-origin requests and a `Host` that names the
 * attacker's domain, so both are checked. Clients that send no `Origin`, such as curl and the CLI,
 * are unaffected.
 */
export function assertTrustedRequest(request: IncomingMessage, allowRemote: boolean): void {
  const host = request.headers.host ?? "";
  if (!allowRemote && !isLoopbackHost(hostname(host))) {
    throw new HttpError(
      421,
      "request.host_not_allowed",
      "Host not allowed: this Plico server only answers requests addressed to a loopback host.",
    );
  }

  const origin = request.headers.origin;
  if (origin !== undefined && !isSameOrigin(origin, host)) {
    throw new HttpError(
      403,
      "request.origin_not_allowed",
      "Cross-origin requests to this Plico server are not allowed.",
    );
  }
}

function isSameOrigin(origin: string, host: string): boolean {
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function hostname(host: string): string {
  const bracketed = /^\[([^\]]+)\]/.exec(host);
  if (bracketed?.[1]) return bracketed[1].toLowerCase();
  return (host.split(":")[0] ?? "").toLowerCase();
}

function isLoopbackHost(name: string): boolean {
  return name === "localhost" || name === "::1" || (isIPv4(name) && name.startsWith("127."));
}
