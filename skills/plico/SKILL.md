---
name: plico
description: Build and check an AI agent with Plico, a TypeScript kit where the agent is a folder of Markdown instructions, skills, TypeScript tools and scripted evals. Use when the user asks to create, extend or test an agent with Plico, mentions @plico-ai or create-plico, or opens a project with plico.config.ts.
---

# Plico

Plico turns a folder into a runnable agent. Docs as Markdown: https://plico.sohab.dev/llms.txt
(all in one file: https://plico.sohab.dev/llms-full.txt). Needs Node 22.18 or later. Developer
preview: do not assume more than the docs say.

## Start

```bash
npm create plico@latest my-agent          # add --provider anthropic|openai|google|openai-compatible for a model
cd my-agent && npm install
```

The scaffold has an `AGENTS.md` with the layout and rules. Read it first.

## Project files

- `agent.md`: the agent's instructions.
- `plico.config.ts`: `defineConfig` from `@plico-ai/sdk`. Optional `model` and `approvals`.
- `skills/<name>/SKILL.md`: needs a `description` in its frontmatter.
- `tools/<name>.tool.ts`: one tool, default export of `defineTool`.
- `evals/<name>.script.json`: one eval case.
- `artifacts/` and `memory/`: required, leave in place.

## A tool

```ts
import { defineTool } from "@plico-ai/sdk";

export default defineTool({
  name: "issue_refund",
  description: "Refund an order.",
  inputSchema: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  capabilities: ["payments:write"],
  approval: { required: true, reason: "Moves money." },
  handler: async ({ orderId }, ctx) => ({ orderId, status: "refunded" }),
});
```

`capabilities` and `approval` are required. `approval.required: true` makes a run wait for a person.
Add `zod` to the project before using a Zod `inputSchema`.

## An eval

```json
{
  "script": [
    { "type": "tool.call", "toolName": "issue_refund", "arguments": { "orderId": "A-1" },
      "result": { "status": "refunded" } },
    { "type": "approval.decide", "approved": true },
    { "type": "assistant.output", "content": "Refunded." }
  ],
  "expect": { "status": "completed", "outputContains": "Refunded" }
}
```

Evals run no handlers: every `tool.call` needs a `result` (or `"live": true`). Leave out
`approval.decide` to test that a tool is held (`"expect": { "status": "waiting" }`). `approved: false`
ends the run as `failed`.

## Verify, with no API key

```bash
npx plico validate .                      # layout, config, tool and skill names
npx plico eval .                          # exit 1 on a failure or when there are no cases
npx plico run --dry --script <file> .     # exit 0 completed, 2 waiting for approval, 1 failed
```

Run `npx plico <command> --help` for flags. Do not put secrets in the project files: events record
tool arguments and results. Keys go in `.env`.

## More

Studio (`npx plico serve --studio .`) is a local UI to chat, read events and approve tool calls, and
needs a configured model to chat. Embedding in a backend, the HTTP API and providers are in the docs.
