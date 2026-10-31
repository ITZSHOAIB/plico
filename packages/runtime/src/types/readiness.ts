import type { EventStore } from "./store.js";

export interface ReadinessOptions {
  databasePath?: string;
  eventStore?: EventStore;
}
