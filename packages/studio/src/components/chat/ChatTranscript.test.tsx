// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ThreadMessage } from "../../types";
import { ChatTranscript } from "./ChatTranscript";

afterEach(cleanup);

const question: ThreadMessage = {
  id: "m-1",
  threadId: "t-1",
  role: "user",
  content: "What can you do?",
  runId: "run-1",
  createdAt: "2026-01-01T00:00:00Z",
};

function transcript(props: Partial<Parameters<typeof ChatTranscript>[0]>) {
  return (
    <ChatTranscript
      messages={[question]}
      loading={false}
      running={false}
      runId="run-1"
      output=""
      showLive={false}
      onInspect={() => undefined}
      {...props}
    />
  );
}

it("renders the agent's reply as Markdown", () => {
  const answer: ThreadMessage = {
    ...question,
    id: "m-2",
    role: "assistant",
    content: "## Tickets\n\n- Triage an **incident**\n\n```ts\nawait createTicket();\n```",
  };
  render(transcript({ messages: [question, answer] }));
  const log = screen.getByRole("log");
  expect(within(log).getByRole("heading", { name: "Tickets" })).toBeTruthy();
  expect(within(log).getByRole("listitem").textContent).toBe("Triage an incident");
  expect(within(log).getByText("incident").tagName).toBe("STRONG");
  expect(within(log).getByText("await createTicket();").closest("pre")).toBeTruthy();
});

it("keeps the user's message as plain text", () => {
  render(transcript({ messages: [{ ...question, content: "**not bold**" }] }));
  expect(within(screen.getByRole("log")).getByText("**not bold**")).toBeTruthy();
});

it("renders an unfinished code fence as code while the reply streams", () => {
  render(transcript({ running: true, showLive: true, output: "Here:\n\n```ts\nconst a = 1" }));
  const log = screen.getByRole("log");
  expect(within(log).getByText("const a = 1").closest("pre")).toBeTruthy();
  expect(log.textContent).not.toContain("```");
});

it("shows a thinking indicator before the first token arrives", () => {
  render(transcript({ running: true, showLive: true, output: "" }));
  expect(within(screen.getByRole("log")).getByText("Agent is thinking")).toBeTruthy();
});

it("does not render raw HTML from the model", () => {
  const { container } = render(
    transcript({ showLive: true, output: 'Hi <img src="x" onerror="alert(1)"> there' }),
  );
  expect(container.querySelector("img")).toBeNull();
});

it("keeps the reply in place when the streamed answer is saved", () => {
  const { rerender } = render(transcript({ running: true, showLive: true, output: "Done." }));
  const live = within(screen.getByRole("log")).getByText("Done.").closest("article");
  expect(live).toBeTruthy();
  const answer: ThreadMessage = { ...question, id: "m-2", role: "assistant", content: "Done." };
  rerender(transcript({ messages: [question, answer] }));
  expect(within(screen.getByRole("log")).getByText("Done.").closest("article")).toBe(live);
});

it("reveals a streamed reply in full when motion is allowed", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  try {
    const { rerender } = render(transcript({ running: true, showLive: true, output: "" }));
    rerender(transcript({ running: true, showLive: true, output: "Smoothly revealed reply." }));
    expect(
      await within(screen.getByRole("log")).findByText("Smoothly revealed reply."),
    ).toBeTruthy();
  } finally {
    vi.unstubAllGlobals();
  }
});
