import { PROVIDER_SETUP, type ScaffoldProvider } from "./providers.js";

/** Matches the adapter ranges `@plico-ai/runtime` accepts as optional peer dependencies. */
const ADAPTER_RANGE = "^4.0.0";

export function configFile(projectName: string, provider?: ScaffoldProvider): string {
  const setup = provider ? PROVIDER_SETUP[provider] : undefined;
  return [
    'import { defineConfig } from "@plico-ai/sdk";',
    "",
    "export default defineConfig({",
    "  schemaVersion: 1,",
    `  name: ${JSON.stringify(projectName)},`,
    '  template: "internal-ops",',
    ...(provider && setup
      ? [
          "  model: {",
          `    provider: ${JSON.stringify(provider)},`,
          `    name: ${JSON.stringify(setup.model)},`,
          ...(setup.baseURL
            ? [
                `    baseURL: ${JSON.stringify(setup.baseURL)},`,
                `    apiKeyEnv: ${JSON.stringify(setup.apiKeyEnv)},`,
              ]
            : []),
          "  },",
        ]
      : []),
    "});",
    "",
  ].join("\n");
}

export function packageFile(version: string, provider?: ScaffoldProvider): string {
  const adapter = provider ? PROVIDER_SETUP[provider].adapter : undefined;
  return `${JSON.stringify(
    {
      private: true,
      type: "module",
      scripts: {
        dev: "plico serve --studio .",
        validate: "plico validate .",
        eval: "plico eval .",
      },
      dependencies: {
        "@plico-ai/sdk": `^${version}`,
        ...(adapter ? { [adapter]: ADAPTER_RANGE } : {}),
      },
      devDependencies: { "@plico-ai/cli": `^${version}` },
    },
    null,
    2,
  )}\n`;
}

export function envExampleFile(provider?: ScaffoldProvider): string {
  const setup = provider ? PROVIDER_SETUP[provider] : undefined;
  if (!setup)
    return "# Copy to .env and add a model provider key when you configure one in plico.config.ts.\n";
  return [
    "# Copy to .env. Plico loads it for `plico run`, `plico serve` and `plico readiness`.",
    ...(setup.placeholderKey
      ? [`# ${setup.label} ignores the key, but the adapter needs a value.`]
      : []),
    `${setup.apiKeyEnv}=${setup.placeholderKey ?? ""}`,
    "",
  ].join("\n");
}

export function gitignoreFile(): string {
  return [".plico/", ".env", "node_modules/", ""].join("\n");
}

export function agentFile(projectName: string): string {
  return [
    "---",
    "agents: [researcher]",
    "tools: []",
    "---",
    "",
    `# ${projectName}`,
    "",
    "This project is organized file-first.",
    "",
    "## Working Principles",
    "",
    "- Start from the Markdown instructions in this repository.",
    "- Use the project files as the source of truth.",
    "- Keep changes scoped and easy to validate.",
    "",
    "## First Pass",
    "",
    "- Read `plico.config.ts` and `agent.md`.",
    "- Inspect `skills/`, `tools/`, `evals/`, `artifacts/`, and `memory/`.",
    "- Add project-specific instructions before expanding the scaffold.",
    "- Ask `researcher` for context you do not have. Give it one clear question.",
    "",
  ].join("\n");
}

export function projectAgentsFile(projectName: string): string {
  return `# ${projectName}: instructions for coding agents

This is a [Plico](https://plico.sohab.dev) project: the agent is the files in this folder. Plico docs as plain Markdown: https://plico.sohab.dev/llms.txt (everything in one file: https://plico.sohab.dev/llms-full.txt).

## Layout

- \`agent.md\` is the agent's instructions. Edit it to change behaviour.
- \`plico.config.ts\` is the project config (\`defineConfig\` from \`@plico-ai/sdk\`): name, optional \`model\`, optional \`approvals\`.
- \`skills/<name>/SKILL.md\` holds a skill. It needs a \`description\` in its frontmatter.
- \`tools/<name>.tool.ts\` holds one tool as a default export (below). \`agent.md\` sets \`tools: []\` so the supervisor delegates instead of calling tools itself; list a tool there to give it to the supervisor.
- \`evals/<name>.md\` holds one eval case, with frontmatter for \`expect\` and \`scorers\` plus criteria as bullets. An optional \`evals/<name>.script.json\` fixture is replayed in scripted runs. A \`.script.json\` on its own is also a case, like the shipped \`smoke.script.json\`. \`plico eval --live\` runs cases that have an \`input\`.
- \`agents/<id>.md\` holds a specialist agent: instructions plus optional frontmatter (\`description\`, \`model\`, \`tools\`, \`skills\`, \`agents\`, \`input\`, \`output\`). An agent lists the specialists it may delegate to under \`agents\`; each becomes a \`delegate_<id>\` tool. Give a specialist an explicit \`tools\` list.
- \`workflows/<id>.ts\` holds a workflow (\`defineWorkflow\` from \`@plico-ai/sdk\`): a \`run({ input, agent, step })\` function that calls agents in code. Run one with \`plico run --workflow <id>\`.
- \`artifacts/\` and \`memory/\` are required folders. Leave them in place.

## Add a tool

\`\`\`ts
import { defineTool } from "@plico-ai/sdk";

export default defineTool({
  name: "issue_refund", // unique, snake_case
  description: "Refund an order.",
  inputSchema: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
    additionalProperties: false,
  },
  capabilities: ["payments:write"], // required, recorded only
  approval: { required: true, reason: "Moves money." }, // required; true makes the run wait for a person
  handler: async ({ orderId }, ctx) => ({ orderId, status: "refunded" }),
});
\`\`\`

\`capabilities\` and \`approval\` are required. For a Zod \`inputSchema\`, add \`zod\` to this project first.

## Add an eval

Start with the Markdown case and its fixture. The frontmatter has \`expect\` and \`scorers\`; criteria are bullets for a judge model. Scripted runs replay the optional fixture without a model or API key. See https://plico.sohab.dev/docs/evals.

\`evals/refund.md\`:

\`\`\`md
---
expect:
  status: completed
  contains: Refunded
scorers:
  rubric: Check that the refund is described accurately.
---
- Confirms which order was refunded
- Does not promise a delivery date
\`\`\`

Optional \`evals/refund.script.json\` fixture:

\`\`\`json
{
  "script": [
    { "type": "tool.call", "toolName": "issue_refund", "arguments": { "orderId": "A-1" }, "result": { "status": "refunded" } },
    { "type": "approval.decide", "approved": true },
    { "type": "assistant.output", "content": "Refunded." }
  ]
}
\`\`\`

A standalone JSON case is the minimal form and uses no model or API key:

\`\`\`json
{
  "description": "A refund waits for approval, then is approved.",
  "script": [
    { "type": "tool.call", "toolName": "issue_refund", "arguments": { "orderId": "A-1" },
      "result": { "status": "refunded" } },
    { "type": "approval.decide", "approved": true },
    { "type": "assistant.output", "content": "Refunded." }
  ],
  "expect": { "status": "completed", "outputContains": "Refunded" }
}
\`\`\`

Steps are \`assistant.output\` (\`content\`), \`tool.call\` (\`toolName\`, \`arguments\`, \`result\` is required because evals do not run handlers, or \`"live": true\` to run the handler), \`approval.decide\` (\`approved\`, right after a tool call that needs approval) and \`artifact.write\` (\`files\`). Leave out \`approval.decide\` and the run stops as \`waiting\`, so \`"expect": { "status": "waiting" }\` tests that a tool is held. \`approved: false\` ends the run as \`failed\`.

To add checks beyond status and text, put an \`evals/<name>.md\` beside the fixture: \`expect\` in its frontmatter (\`status\`, \`contains\`, \`tool\`, \`notTool\`, \`artifact\`, \`output\`), custom scorers from \`evals/scorers/\` or a \`rubric\` or \`factuality\` check under \`scorers\`, and criteria as bullets, which a judge model grades in \`plico eval --live\`. See https://plico.sohab.dev/docs/evals.

## Check your work

\`\`\`bash
npm run validate         # plico validate: layout, config, tool and skill names
npm run eval             # plico eval: every case in evals/; exit 1 on any failure or no cases
npx plico run --dry .    # runs with a scripted model; add --script <file> for your own steps
\`\`\`

\`plico run --dry\` exits 0 on completion, 2 when a run is waiting for approval and 1 on failure. Run \`npx plico <command> --help\` for a command's flags.

## Rules

- Keep secrets in \`.env\`, never in \`agent.md\`, tools or config. Events record tool arguments and results.
- Do not edit \`.plico/\`: it holds saved runs.
- Do not ask for a model key to test. Use \`--dry\` and evals.
- With a model, \`plico serve --studio .\` opens Studio, a local UI to chat, read run events and approve tool calls.
`;
}

export function projectClaudeFile(): string {
  return "@AGENTS.md\n";
}

export function triageSkillFile(): string {
  return [
    "---",
    "description: Review incoming work items and choose the smallest safe next step.",
    "---",
    "# Triage",
    "",
    "Review incoming work items, identify the smallest safe next step, and record the outcome.",
    "",
    "Focus on the project files first, then the surrounding context.",
    "",
  ].join("\n");
}

export function toolsReadmeFile(): string {
  return [
    "# Tools",
    "",
    "Add TypeScript tool modules here when the project needs executable helpers.",
    "",
    "Each tool is one `<name>.tool.ts` file with a default export from `defineTool`.",
    "",
    "A tool handler receives `(input, ctx)`. `ctx` has `signal`, `idempotencyKey`, `artifacts` and",
    "`context`. A run that is interrupted can repeat the tool call that was in flight, so pass",
    "`idempotencyKey` to any API that takes one. The key is stable for a call, and `signal` aborts",
    "when the run is cancelled.",
    "",
    "Set `inputSchema` to a JSON Schema object or a Zod 4 schema. Plico validates each call and",
    "sends JSON Schema to the model. Parsed Zod values, including defaults, reach the handler. Add",
    "`zod` to this project's dependencies before importing it in a tool.",
    "",
    'Wrap a tool in `defineTool` from `"@plico-ai/sdk"` to type the handler `input` from its `inputSchema`.',
    "",
  ].join("\n");
}

export function smokeEvalFile(): string {
  return `${JSON.stringify(
    {
      description:
        "Scripted smoke case. It needs no model and no key, so it passes in CI. Replace the steps with calls to your own tools.",
      script: [{ type: "assistant.output", content: "The project boots." }],
      expect: { status: "completed", outputContains: "boots" },
    },
    null,
    2,
  )}
`;
}

export function memoryReadmeFile(): string {
  return [
    "# Memory",
    "",
    "Use this folder for durable project notes, decisions, and recurring context.",
    "",
  ].join("\n");
}

export function artifactsReadmeFile(): string {
  return [
    "# Artifacts",
    "",
    "Use this folder for generated outputs that belong to the project.",
    "",
  ].join("\n");
}

export function projectReadmeFile(projectName: string): string {
  return [
    `# ${projectName}`,
    "",
    "Canonical internal-ops starter project generated by create-plico.",
    "",
    "Start with `agent.md`, then inspect `skills/`, `tools/`, `evals/`, `memory/`, and `artifacts/`.",
    "",
  ].join("\n");
}
