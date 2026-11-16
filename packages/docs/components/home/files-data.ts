export type SourceFile = {
  path: string;
  label: string;
  lines: string[];
};

export const sources: SourceFile[] = [
  {
    path: "agent.md",
    label: "Define its job",
    lines: [
      "# Support agent",
      "",
      "Help the team triage support requests.",
      "Follow the triage skill.",
      "Create a ticket when action is needed.",
    ],
  },
  {
    path: "skills/triage/SKILL.md",
    label: "Teach a workflow",
    lines: [
      "---",
      "description: Choose the smallest safe next step.",
      "---",
      "# Triage a request",
      "",
      "1. Read the issue.",
      "2. Identify what needs to happen.",
      "3. Create a clear, actionable ticket.",
    ],
  },
  {
    path: "tools/create-ticket.tool.ts",
    label: "Give it an action",
    lines: [
      'import { defineTool } from "@plico-ai/sdk";',
      "",
      "export default defineTool({",
      '  name: "create_ticket",',
      '  description: "Create a support ticket.",',
      "  inputSchema: {",
      '    type: "object",',
      '    properties: { title: { type: "string" } },',
      '    required: ["title"],',
      "  },",
      '  capabilities: ["ticket:write"],',
      "  approval: { required: false },",
      "  handler: async (input, { artifacts }) => {",
      '    await artifacts.write("tickets/new.md", input.title);',
      '    return { ticketId: "TCK-1042" };',
      "  },",
      "});",
    ],
  },
];

/** The anchor, as create-plico writes it for a project with no provider yet */
export const config: SourceFile = {
  path: "plico.config.ts",
  label: "Anchor the project",
  lines: [
    'import { defineConfig } from "@plico-ai/sdk";',
    "",
    "export default defineConfig({",
    "  schemaVersion: 1,",
    '  name: "support-agent",',
    '  template: "internal-ops",',
    "});",
  ],
};
