import type { ThreadStore } from "../../storage/sqlite/threads.js";
import type { EventStore, ReadinessDiagnostic } from "../../types/index.js";
import { makeDiagnostic } from "../diagnostic.js";

export function checkThreadStore(
  eventStore: EventStore | undefined,
  threadStore: Pick<ThreadStore, "storageIdentity"> | undefined,
): ReadinessDiagnostic[] {
  if (!threadStore) return [];
  const sharesIdentity =
    threadStore.storageIdentity !== undefined &&
    threadStore.storageIdentity === eventStore?.storageIdentity;
  return sharesIdentity
    ? [makeDiagnostic("ok", "threads.store", "Thread and run stores share the same database.")]
    : [
        makeDiagnostic(
          "error",
          "threads.store",
          "Thread and run stores must use the same database. Thread runs cannot start.",
        ),
      ];
}
