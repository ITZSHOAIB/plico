---
"@plico-ai/runtime": patch
---

In a run with a real model, an unknown tool, invalid tool arguments, or a throwing tool handler is now returned to the model as the tool result (`{ "error": "..." }`) so it can correct the call, instead of ending the run. A run allows 2 such failures; the third fails it as before. This makes small local models, which often send numbers as strings, usable. Scripted runs are unchanged.
