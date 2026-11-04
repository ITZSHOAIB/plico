import type { ThreadStore } from "../storage/sqlite/threads.js";
import type { EventStore } from "./store.js";

export interface ReadinessOptions {
  databasePath?: string;
  eventStore?: EventStore;
  threadStore?: Pick<ThreadStore, "storageIdentity">;
  /** Built Studio directory. Omit when Studio is not in use. */
  studioPath?: string | undefined;
}
