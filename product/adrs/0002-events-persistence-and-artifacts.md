# Use a canonical event log and versioned artifact workspace

Status: accepted

Plico's native event model will be a versioned public contract and the source of truth for replay, persistence, stream resume, Studio, React, AG-UI mapping, audit, and eval replay. Persistence will be event-log primary, and artifacts will be modeled as a versioned virtual filesystem with evented writes, snapshots, previews, diffs, export, and replay.

## Considered Options

- Canonical native event log with derived read models.
- Relational records as the primary source of truth.
- Transport-specific event shapes.
- Plain generated files or chat attachments for artifacts.

## Consequences

Threads, transcripts, run timelines, tool views, approval records, artifact views, and eval views are projections from the same log rather than separate histories. Storage adapters must preserve event ordering and IDs, while artifact storage adapters must preserve workspace versions instead of only storing final files.
