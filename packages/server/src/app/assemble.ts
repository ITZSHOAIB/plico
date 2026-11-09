import { createFetchHandler, createNodeHandler } from "../mount.js";
import { withThreadTitles } from "../thread-titles.js";
import { followEvents } from "./events.js";
import { cancelRun, decideApproval, listRuns, startRun } from "./runs.js";
import {
  createThread,
  getThread,
  listThreads,
  renameThread,
  sendMessage,
  threadMessages,
} from "./threads.js";
import type { AppDeps, Plico } from "./types.js";

/** What the HTTP listener needs behind a `Plico`. Never part of the public surface. */
export interface PlicoInternals {
  deps: AppDeps;
  /** Aborts when `close()` starts, so open event streams end. */
  stop: AbortSignal;
}

const registry = new WeakMap<Plico, PlicoInternals>();

export function internalsOf(plico: Plico): PlicoInternals {
  const internals = registry.get(plico);
  if (!internals) throw new TypeError("Not a Plico instance created by this package.");
  return internals;
}

/** Builds the programmatic API over stores that already exist. `onClose` releases what they hold. */
export function assemblePlico(
  appDeps: AppDeps,
  onClose: () => void | Promise<void> = () => {},
): Plico {
  const deps: AppDeps = { ...appDeps, eventStore: withThreadTitles(appDeps) };
  const stopper = new AbortController();
  let closing: Promise<void> | undefined;
  const plico: Plico = {
    threads: {
      create: (options) => createThread(deps, options),
      get: (threadId) => getThread(deps, threadId),
      list: (filter) => listThreads(deps, filter),
      rename: (threadId, title) => renameThread(deps, threadId, title),
      messages: (threadId) => threadMessages(deps, threadId),
      send: (threadId, content, options) => sendMessage(deps, threadId, content, options),
    },
    runs: {
      start: (options) => startRun(deps, options),
      get: (runId) => deps.eventStore.getRun(runId),
      list: (filter) => listRuns(deps, filter),
      cancel: (runId) => cancelRun(deps, runId),
      events: (runId, options) => followEvents(deps, runId, { ...options, stop: stopper.signal }),
    },
    approvals: {
      decide: (runId, requestId, approved, options) =>
        decideApproval(deps, runId, requestId, approved, options),
    },
    fetch: (options) => createFetchHandler({ deps, stop: stopper.signal }, options),
    node: (options) => createNodeHandler({ deps, stop: stopper.signal }, options),
    close() {
      closing ??= (async () => {
        stopper.abort();
        await onClose();
      })();
      return closing;
    },
  };
  registry.set(plico, { deps, stop: stopper.signal });
  return plico;
}
