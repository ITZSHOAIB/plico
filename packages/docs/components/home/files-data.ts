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
      'import { defineTool } from "plico";',
      "",
      "export default defineTool({",
      '  name: "create_ticket",',
      '  description: "Create a support ticket.",',
      "  inputSchema: {",
      '    type: "object",',
      '    properties: { title: { type: "string" } },',
      '    required: ["title"],',
      "  },",
      "  handler: async (input, { artifacts }) => {",
      '    await artifacts.write("tickets/new.md", input.title);',
      '    return { ticketId: "TCK-1042" };',
      "  },",
      "});",
    ],
  },
];

/** A trimmed run. Event types match the canonical event log in `@plico-ai/contracts`. */
export const events = [
  { type: "run.started", detail: "support-agent" },
  { type: "instructions.composed", detail: "2 sources" },
  { type: "tools.discovered", detail: "1 tool" },
  { type: "model.request", detail: "1 tool offered" },
  { type: "tool.call", detail: "create_ticket" },
  { type: "artifact.file.written", detail: "tickets/new.md" },
  { type: "tool.result", detail: '{ ticketId: "TCK-1042" }' },
  { type: "assistant.output", detail: "Created TCK-1042." },
  { type: "run.completed", detail: "completed" },
];
