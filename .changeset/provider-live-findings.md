---
"@plico-ai/runtime": patch
"create-plico": patch
---

A server that rejects the reasoning text Plico replays after a tool call (Groq does) now gets one retry without it, so tool calls work. A provider rejection (HTTP 4xx) now ends with the provider's own message, such as an unknown model name. New Google projects use `gemini-3.5-flash`, because `gemini-2.5-flash` returns 404.
