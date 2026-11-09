import { defineTool } from "@plico-ai/sdk";

export default defineTool({
  name: "close_ticket",
  description: "Close a support ticket. This cannot be undone, so a person approves each call.",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: { type: "string" },
    },
    required: ["ticketId"],
    additionalProperties: false,
  },
  capabilities: ["ticket:write"],
  approval: { required: true, reason: "Closing a ticket cannot be undone." },
  handler: async (input, { artifacts }) => {
    await artifacts.write(
      `tickets/${input.ticketId}.closed.md`,
      `# ${input.ticketId} - closed\n\nClosed after approval.`,
      { mimeType: "text/markdown" },
    );
    return { ticketId: input.ticketId, status: "closed" };
  },
});
