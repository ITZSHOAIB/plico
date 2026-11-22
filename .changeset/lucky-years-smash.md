---
"@plico-ai/runtime": patch
"@plico-ai/core": patch
"@plico-ai/contracts": patch
---

Execute allowlisted stdio and HTTP MCP tools through approval policy, cancellation and durable recovery. Skip unavailable sources with warnings in provider runs, preserve offline scripts, and reject actual name collisions. Interrupted calls fail by default; exact tools may opt into crash replay with replayOnCrash. Add per-server callTimeoutMs and stable policy fingerprints.
