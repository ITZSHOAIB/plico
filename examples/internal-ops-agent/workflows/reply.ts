import { defineWorkflow } from "@plico-ai/sdk";

const verdict = {
  type: "object",
  required: ["approved"],
  properties: { approved: { type: "boolean" }, notes: { type: "string" } },
} as const;

/** Draft a reply, then review and revise it until the reviewer approves, at most twice. */
export default defineWorkflow<{ request: string }>({
  description: "Draft a reply to an ops request, review it, and revise it until it is approved.",
  input: {
    type: "object",
    required: ["request"],
    properties: { request: { type: "string" } },
  },
  maxAgentCalls: 5,
  async run({ input, agent }) {
    let reply: string = await agent("writer", { task: `Draft a reply to: ${input.request}` });
    for (let round = 0; round < 2; round++) {
      const review = await agent("reviewer", {
        task: `Review this reply:\n${reply}`,
        output: verdict,
      });
      if (review.approved) break;
      reply = await agent("writer", {
        task: `Revise this reply:\n${reply}\n\nReviewer notes: ${review.notes ?? "none"}`,
      });
    }
    return reply;
  },
});
