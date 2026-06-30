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
  handler: async (input) => ({
    ticketId: `TCK-${input.title.length}`,
  }),
} as const;
