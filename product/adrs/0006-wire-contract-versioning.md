# Version wire contracts through the URL, with saved data versioned separately

Status: accepted

Plico versions its HTTP API through the `/v1` URL prefix instead of a separate contract version. After the first publish, `/v1` only takes additive changes and a breaking change means `/v2`; until then `/v1` may still change freely. A committed snapshot of the response shapes, checked in CI, enforces this because a version rule alone relies on someone remembering it. Saved data outlives any code upgrade, so stored records such as events and eval reports each carry their own `schemaVersion`.

## Considered Options

- URL version, chosen because `/v1` already exists and is easy to understand.
- A single advertised contract version. It mostly repeats `/v1` today, and can be added without breaking anyone if `@plico/react` needs a compatibility check.
- `schemaVersion` on every response. Too much bookkeeping for every client, so it stays on saved data only.
- Date-based versions with server-side translation. Too heavy for this stage.

## Consequences

Removing or renaming a field, or changing its type or meaning, is breaking; adding a response field is not. Studio ships with the server, so it cannot drift from it. An eval report with an unknown `schemaVersion` reads as absent, so the next `plico eval` replaces it.
