import { existsSync } from "node:fs";
import { createSqliteEventStore } from "../storage/index.js";
import type { EventStore } from "../types/index.js";

export interface ReadinessDatabase {
  eventStore?: EventStore;
  /** True when the caller supplied the store, rather than readiness opening one. */
  attached: boolean;
  openError?: string;
}

export function openDatabase(
  databasePath: string,
  eventStore: EventStore | undefined,
): ReadinessDatabase {
  if (eventStore) return { eventStore, attached: true };
  if (!existsSync(databasePath)) return { attached: false };

  try {
    const store = createSqliteEventStore({ databasePath, readOnly: true });
    return { eventStore: store, attached: false };
  } catch (error) {
    return { attached: false, openError: (error as Error).message };
  }
}
