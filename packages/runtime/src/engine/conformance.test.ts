import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineConformance } from "../testing/engine-conformance.js";
import { createEngine, createMemoryJournal, createSqliteJournal } from "./index.js";

engineConformance("memory", async () => createEngine({ journal: createMemoryJournal() }));
engineConformance("sqlite", async () =>
  createEngine({
    journal: createSqliteJournal({
      databasePath: join(await mkdtemp(join(tmpdir(), "plico-conformance-")), "state.sqlite"),
    }),
  }),
);
