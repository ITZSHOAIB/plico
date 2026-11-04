import type { PlicoEvent, RunSummary, Thread, ThreadMessage } from "../types";

export interface ChatFixture {
  thread: Thread;
  messages: ThreadMessage[];
  run: RunSummary | null;
  events: PlicoEvent[];
  live?: string;
}

const startedAt = "2026-11-04T09:30:00.000Z";
function fixture(
  id: string,
  status: RunSummary["status"] | null,
  contents: Array<["user" | "assistant", string]>,
): ChatFixture {
  const runId = `run-${id.toLowerCase()}`;
  return {
    thread: { id, createdAt: startedAt },
    messages: contents.map(([role, content], index) => ({
      id: `${id}-${index}`,
      threadId: id,
      role,
      content,
      createdAt: startedAt,
      runId,
    })),
    run: status
      ? {
          runId,
          projectRoot: "/demo",
          projectName: "Internal Ops",
          status,
          startedAt,
          endedAt: status === "running" ? null : "2026-11-04T09:30:05.000Z",
        }
      : null,
    events: [],
  };
}

function event<T extends PlicoEvent["type"]>(
  runId: string,
  sequence: number,
  type: T,
  payload: PlicoEvent<T>["payload"],
): PlicoEvent {
  return {
    schemaVersion: 1,
    streamType: "run",
    streamId: runId,
    runId,
    id: `event-${sequence}`,
    sequence,
    timestamp: startedAt,
    type,
    payload,
  } as PlicoEvent;
}

const completed = fixture("Completed", "completed", [
  [
    "user",
    "Can you help Maya regain VPN access? She is seeing an authentication error after changing her password.",
  ],
  [
    "assistant",
    "I checked the access request and created a support ticket for Maya.\n\nThe IT team can reset the VPN credentials and verify her device enrollment. The ticket includes the authentication error and the recent password change.",
  ],
  ["user", "What should I tell her while she waits?"],
  [
    "assistant",
    "Let her know the request is with IT, and ask her to keep the device connected to the internet. She should avoid retrying too many times while the credentials are being reset.",
  ],
]);
completed.events = [
  event("run-completed", 1, "run.started", {
    projectRoot: "/demo",
    projectName: "Internal Ops",
    threadId: "Completed",
  }),
  event("run-completed", 2, "instructions.composed", {
    length: 120,
    sources: ["agent.md", "skills/triage.md"],
    content: "Triage internal operations requests.",
  }),
  event("run-completed", 3, "tool.call", {
    toolName: "create-ticket",
    arguments: { title: "VPN access for Maya", priority: "normal" },
  }),
  event("run-completed", 4, "tool.result", {
    toolName: "create-ticket",
    result: { id: "IT-1042", status: "open" },
  }),
  event("run-completed", 5, "assistant.output", {
    content: "The IT team can reset the VPN credentials.",
  }),
  event("run-completed", 6, "run.completed", { output: "Ticket created." }),
];

const streaming = fixture("Streaming", "running", [
  ["user", "Summarize the onboarding checklist and identify anything that needs follow-up."],
]);
streaming.live =
  "I’m checking the onboarding checklist now. So far, the equipment and account setup are complete; I’m reviewing the remaining access requests…";
streaming.events = [
  event("run-streaming", 1, "run.started", { projectRoot: "/demo", projectName: "Internal Ops" }),
  event("run-streaming", 2, "model.attempt", { turn: 1, attemptId: "attempt-1" }),
  event("run-streaming", 3, "model.delta", {
    turn: 1,
    attemptId: "attempt-1",
    text: streaming.live,
  }),
];

const failed = fixture("Failed", "failed", [
  ["user", "Create a ticket for my laptop replacement."],
]);
failed.events = [
  event("run-failed", 1, "run.started", { projectRoot: "/demo", projectName: "Internal Ops" }),
  event("run-failed", 2, "tool.call", {
    toolName: "create-ticket",
    arguments: { title: "Laptop replacement" },
  }),
  event("run-failed", 3, "run.error", {
    phase: "tool",
    message: "Connection to the ticket service failed. Try again when the service is available.",
  }),
  event("run-failed", 4, "run.failed", { phase: "tool" }),
];

const long = fixture(
  "Long-form",
  "completed",
  Array.from({ length: 12 }, (_, index) => [
    index % 2 === 0 ? "user" : "assistant",
    index % 2 === 0
      ? `Question ${Math.floor(index / 2) + 1}: What should the team know about the rollout?`
      : "The rollout is on track. The next step is to confirm access with each team, document any blockers, and share the handoff notes before the end of the week.\n\nNo further action is required until the access checks are complete.",
  ]),
);
long.events = [
  event("run-long-form", 1, "run.started", { projectRoot: "/demo", projectName: "Internal Ops" }),
  event("run-long-form", 2, "run.completed", { output: "Rollout summary ready." }),
];

export const chatFixtures: ChatFixture[] = [
  completed,
  streaming,
  failed,
  long,
  fixture("Empty", null, []),
];
