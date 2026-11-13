---
"@plico-ai/core": patch
"@plico-ai/runtime": patch
"create-plico": patch
---

Breaking: tool `inputSchema` supports Zod 4 and JSON Schema only. A Zod 3 schema is rejected with a message that says so. Projects on `zod` 3.25 can switch to `import { z } from "zod/v4"` without upgrading the package.
