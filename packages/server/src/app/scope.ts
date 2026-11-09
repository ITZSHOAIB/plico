import { matchesMetadata } from "@plico-ai/runtime";
import { PlicoError } from "./errors.js";
import type { Metadata } from "./metadata.js";
import type { AppDeps } from "./types.js";

/** True when the request's scope allows an item with this metadata. Without a scope, always. */
export function inScope(deps: Pick<AppDeps, "scope">, metadata: Metadata | undefined): boolean {
  return deps.scope === undefined || matchesMetadata(metadata, deps.scope);
}

/** The metadata a new thread or run gets. A scope owns it; a scoped client cannot set its own. */
export function scopedMetadata(
  deps: Pick<AppDeps, "scope">,
  requested: Metadata | undefined,
): Metadata | undefined {
  if (deps.scope === undefined) return requested;
  if (requested !== undefined)
    throw new PlicoError("request.invalid", "metadata is set by the host through scope.");
  return deps.scope;
}

/** A list filter narrowed by the scope. The scope's keys win, so a client cannot widen it. */
export function scopedFilter(
  deps: Pick<AppDeps, "scope">,
  requested: Metadata | undefined,
): Metadata | undefined {
  return deps.scope === undefined ? requested : { ...requested, ...deps.scope };
}
