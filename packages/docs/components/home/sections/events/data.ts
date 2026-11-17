/** The run the views read: real event types and payload shapes from `@plico-ai/contracts`, trimmed */
export const RUN_ID = "7f3c9a2e";

export const runEvents = [
  { sequence: 1, type: "run.started", payload: { projectName: "support-agent" } },
  {
    sequence: 5,
    type: "tool.call",
    payload: { toolName: "create_ticket", arguments: { title: "Refund stuck" } },
  },
  {
    sequence: 7,
    type: "tool.result",
    payload: { toolName: "create_ticket", result: { ticketId: "TCK-1042" } },
  },
  { sequence: 9, type: "run.completed", payload: { output: "Created TCK-1042." } },
];

export const views = [
  {
    port: "cli",
    name: "CLI",
    command: `plico events ${RUN_ID}`,
    text: "Print any run's events from the terminal.",
    href: "/docs/cli",
  },
  {
    port: "http",
    name: "HTTP API",
    command: "plico serve",
    text: "A thin native API over the runtime and the event store.",
    href: "/docs/http-api",
  },
  {
    port: "studio",
    name: "Studio",
    command: "plico serve --studio",
    text: "Watch runs, approve tool calls and browse artifacts.",
    href: "/docs/studio",
  },
] as const;
