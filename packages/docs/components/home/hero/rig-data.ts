/** A harness part plugged into the computer, on its left or right side */
export interface Part {
  id: string;
  name: string;
  detail: string;
  side: "l" | "r";
}

export const PARTS: Part[] = [
  { id: "providers", name: "providers", detail: "Anthropic · OpenAI · Google", side: "l" },
  { id: "tools", name: "typed tools", detail: "create_ticket", side: "l" },
  { id: "approvals", name: "approvals", detail: "ask before acting", side: "l" },
  { id: "runs", name: "durable runs", detail: "cancel any run", side: "l" },
  { id: "log", name: "event log", detail: "SQLite, every step", side: "r" },
  { id: "artifacts", name: "artifacts", detail: "tickets/1042.md", side: "r" },
  { id: "evals", name: "evals", detail: "plico eval, no API key", side: "r" },
  { id: "studio", name: "Studio + API", detail: "plico serve", side: "r" },
];

/** The run the screen reads back, as `plico events` lists it */
export const RUN = "run-7f3a9c1e";
export const HEAD = [`$ plico events ${RUN}`, `Events for ${RUN}`];

/**
 * Its events, a sequence number and a type each (the payloads left off), with the part each one
 * lights up. Every event also lands in the event log.
 */
export const LOG: [line: string, part: string][] = [
  ["1 run.started", "runs"],
  ["2 instructions.composed", "log"],
  ["3 model.request", "providers"],
  ["6 model.response", "providers"],
  ["7 tool.call", "tools"],
  ["8 tool.result", "tools"],
  ["9 approval.requested", "approvals"],
  ["10 approval.decided", "approvals"],
  ["11 artifact.file.written", "artifacts"],
  ["14 assistant.output", "studio"],
  ["15 run.completed", "runs"],
];

/** How many event lines the screen holds under its command */
export const ROWS = 8;

/** The first frame, on the server and with reduced motion: the run under way */
export const REST = LOG.slice(0, ROWS).map(([line]) => line);

/** What the screen prints once the parts are put away: the Markdown you wrote */
export const MD = [
  "$ cat agent.md",
  "# Support agent",
  "Open a ticket when a refund is stuck.",
  "Ask before closing anything.",
  "",
  "$ cat skills/triage/SKILL.md",
  "---",
  "description: Choose the smallest safe next step.",
  "---",
];

export const KEYS = 42;

/** The rig's text alternative in each view: running, then folded */
export const ALT = [
  "A computer running a Plico agent. Providers, typed tools, approvals, durable runs, the event log, artifacts, evals and Studio are plugged into it, and its screen lists the run's events.",
  "The same computer with every part put away. Its screen prints agent.md and a skill's SKILL.md: the Markdown files the agent is made of.",
];
