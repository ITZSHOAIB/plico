# Store byte-safe artifacts and stage writes with durable steps

Status: accepted (2026-11-07), implemented by epic #142.

Plico artifacts are versioned workspace files recorded in the canonical run event log (ADR 0002). Artifact contents may be text or arbitrary bytes. SQLite stores the raw bytes once, addressed by their SHA-256 content hash, in a BLOB. MIME type and version remain properties of each artifact write.

## Content representation

Text artifact content remains a string in Plico events. Binary artifact content uses the JSON-safe value `{ "encoding": "base64", "data": "…" }`. The base64 data decodes to the exact bytes stored under the event's content hash. Event readers reconstruct this tagged value from the BLOB; legacy text events continue to read as strings. The event payload therefore remains portable over the versioned JSON HTTP API without provider-specific or Node-specific shapes.

The TypeScript tool context accepts text or `Uint8Array` for writes and returns text or `Uint8Array` from reads. It does not expose base64 to tool authors. Model-facing file tools remain text-only and are delivered in a later #142 slice.

The tool context offers three operations: `read(path)` returns the current file with its content and metadata, or `undefined` when it is absent; `write(path, content, { mimeType? })` returns `{ path, version }`; and `list()` returns metadata for the current files without their content. Listed metadata includes path, byte size, MIME type, version, and content hash.

## Workspace scope

- A run with a `threadId` uses the thread workspace. It is the ordered projection of artifact events from the thread's runs. Versions continue across turns.
- A run without a thread uses its root run's workspace. This supports child runs when multi-agent workflows arrive.
- Artifact write events remain in their originating run streams, as required by ADR 0007. Thread workspace reads combine those streams in their durable global event order.

## Staged writes

Artifact writes made through a tool context are buffered for the duration of its durable tool step. The durable step records the tool result and the buffered write receipts together. After the step result is recorded, Plico appends the `tool.result` event followed by the staged `artifact.file.written` events. Each write receipt includes the path, MIME type, content hash, content representation, and version.

On recovery, the engine returns the recorded step result without invoking the handler again. The recorded buffered writes are then appended in the same order and with the same payloads, so replay does not duplicate a write or depend on the handler's current output. Reads and lists within the tool context include earlier committed writes and writes staged earlier in the same step.
If a handler fails or is cancelled, its staged writes are discarded; the handler may have read those staged values before failing.

## Consequences

- Adding tagged binary content to the native event and artifact contracts follows ADR 0006; the committed contract snapshot is updated deliberately.
- The SQLite schema migrates existing text content to BLOBs without rewriting event meaning or invalidating recorded runs.
- Content hashes are computed from the raw UTF-8 bytes for strings and raw bytes for `Uint8Array` values.
- The same staged write mechanism is used by provider-invoked TypeScript tools and scripted tool execution. Model-facing artifact tools, artifact access settings, and thread workspace HTTP routes are separate slices of #142.
