/** A file in an agent project, carried to the computer on its own disk */
export interface AgentFile {
  /** the folder, printed small on the label */
  dir: string;
  name: string;
  /** what the file gives the agent, on the loader and the empty bay */
  role: string;
}

export const FILES: AgentFile[] = [
  { dir: "my-agent/", name: "agent.md", role: "instructions" },
  { dir: "skills/triage/", name: "SKILL.md", role: "skill" },
  { dir: "tools/", name: "issue_refund.tool.ts", role: "tool" },
  { dir: "my-agent/", name: "plico.config.ts", role: "model" },
];

/** The scaffold's default Anthropic model, shown in the chat header */
export const MODEL = "claude-sonnet-5-5";

/** The question typed into the chat, and the reply that streams back */
export const ASK = "Order 4471 was charged twice. Can you refund the duplicate?";
export const ANSWER =
  "Done. I refunded the duplicate $49.00 charge on order 4471. It should reach the card in 5 to 10 business days.";

/** The thread title Plico gives the conversation once the run completes */
export const THREAD = "Duplicate charge on order 4471";

/** The example tool from the scaffold's guide: it moves money, so it waits for a person */
export const TOOL = {
  name: "issue_refund",
  args: "{ order: 4471, amount: 49 }",
  reason: "Moves money.",
};
export const TOOL_RESULT = "refund re_4471 · succeeded";

/** The window's title as the story goes */
export const TITLES = {
  idle: "no agent loaded",
  loading: "loading my-agent/",
  ready: "support-agent",
  running: "support-agent · run 1",
  done: "support-agent · run completed",
};

/** Keys on the keyboard, the space bar among them */
export const KEYS = 41;
export const SPACE = 34;

/** The rig's text alternative: before the files go in, then once the agent is chatting */
export const ALT = [
  "A computer with no agent loaded, beside four floppy disks holding agent.md, a triage skill, an issue_refund tool and plico.config.ts.",
  "The disks are in the computer and its screen shows a chat: asked to refund a duplicate charge, the agent loads its triage skill, waits for approval to call issue_refund, then confirms the refund.",
];
