export const beats = [
  {
    label: "Describe",
    title: "Start with what your agent should do.",
    detail:
      "Plain Markdown gives your agent a job. Your instructions stay readable, reviewable and yours.",
    duration: 5400,
  },
  {
    label: "Equip",
    title: "Add the things that make it yours.",
    detail:
      "A skill for the workflow. A TypeScript tool for the action. Add files as your agent grows.",
    duration: 6200,
  },
  {
    label: "Connect",
    title: "The harness comes with Plico.",
    detail:
      "Plico loads the project, brings the instructions and tools together, and handles the run around them.",
    duration: 5400,
  },
  {
    label: "Run",
    title: "Your files. A working agent.",
    detail:
      "Run it, see which tool it calls, and inspect the event log. Keep building the agent in the same folder.",
    duration: 7600,
  },
] as const;

export const sources = [
  {
    path: "agent.md",
    type: "md",
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
    path: "skills/triage.md",
    type: "md",
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
    type: "ts",
    label: "Give it an action",
    lines: [
      'import { createHash } from "node:crypto";',
      "",
      "export default {",
      '  name: "create_ticket",',
      '  description: "Create a support ticket.",',
      '  capabilities: ["ticket:write"],',
      "  approval: { required: false },",
      "  handler: async (input, { idempotencyKey, artifacts }) => {",
      '    const ticketId = "TCK-" + createHash("sha256").update(idempotencyKey).digest("hex");',
      '    await artifacts.write("tickets/" + ticketId + ".md", input.title, { mimeType: "text/markdown" });',
      "    return { ticketId };",
      "  },",
      "};",
    ],
  },
] as const;
