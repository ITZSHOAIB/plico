import type { EventStore } from "./store.js";

export interface ReadinessOptions {
  databasePath?: string;
  eventStore?: EventStore;
  /** Built Studio directory. Omit when Studio is not in use. */
  studioPath?: string | undefined;
}
