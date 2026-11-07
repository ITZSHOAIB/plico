export default {
  name: "create_ticket",
  description: "Create a support ticket for the internal ops team.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
    },
    required: ["title"],
    additionalProperties: false,
  },
  capabilities: ["ticket:write"],
  approval: { required: false },
  handler: async (input, { artifacts }) => {
    const ticketId = `TCK-${input.title.length}`;
    await artifacts.write(
      `tickets/${ticketId}.md`,
      `# ${ticketId} - ${input.title}\n\nCreated by the internal ops agent.`,
      { mimeType: "text/markdown" },
    );
    return { ticketId };
  },
} as const;
