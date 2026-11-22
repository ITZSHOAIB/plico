---
"@plico-ai/runtime": minor
"@plico-ai/core": patch
"@plico-ai/contracts": patch
---

Execute allowlisted stdio and HTTP MCP tools through approval policy, cancellation and durable recovery. Skip unavailable sources with warnings in provider runs, preserve offline scripts, and reject actual name collisions. Interrupted calls fail by default; exact tools may opt into crash replay with replayOnCrash. Add per-server callTimeoutMs and stable policy fingerprints.

Stricter recovery fingerprints also pin approvals for TypeScript-only projects. Waiting runs saved with older tool-only fingerprints fail recovery after upgrading, even if the project is unchanged. Finish those waits before upgrading or restart them afterward.
