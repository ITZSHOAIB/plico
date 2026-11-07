# plico

Typed helpers for writing a Plico project. Both return their argument unchanged; they exist so your editor can check the file.

```ts
// plico.config.ts
import { defineConfig } from "plico";

export default defineConfig({ schemaVersion: 1, name: "Support Agent", template: "internal-ops" });
```

```ts
// tools/create-ticket.tool.ts
import { defineTool } from "plico";

export default defineTool({
  name: "create_ticket",
  description: "Create a support ticket.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  capabilities: ["ticket:write"],
  approval: { required: false },
  handler: async (input) => ({ created: input.title }), // input: { title: string }
});
```

`defineTool` infers the handler `input` from `inputSchema`:

- A JSON Schema is read for `type`, `enum`, `const`, `properties`, `required` and `items`. Any other keyword makes that part `unknown`; it never becomes a type error.
- A Zod schema (3 or 4) gives its parsed output type. Add `zod` to your project to use one.

You do not need to install `plico` in the project. `plico validate` and `plico run` resolve it from the project when it is there, and fall back to the copy that comes with the CLI. Install it when you want editor types.
