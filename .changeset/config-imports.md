---
"@plico-ai/core": patch
---

`plico.config.ts` can import local TypeScript modules and the project's installed packages, so Zod `input` and `output` schemas in the config now load and validate. Previously any import other than `@plico-ai/sdk` failed.
