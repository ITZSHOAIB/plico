/**
 * The computer's screen. The server renders both faces, the loader and the chat; this switches
 * between them, ticks off the loader's checklist and builds the chat's messages, each the way
 * Plico Studio shows it.
 */
import { ANSWER, FILES, THREAD, TOOL, TOOL_RESULT } from "./rig-data";

type Child = Node | string;

function el(tag: string, className: string, ...children: Child[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

/** a tool call's line: its state, its name, then its arguments or result */
function stepParts(state: "run" | "ok" | "wait", name: string, detail: string): Child[] {
  const mark =
    state === "run"
      ? el("span", "ph-spin")
      : el("span", `ph-step-${state}`, state === "ok" ? "✓" : "●");
  return [mark, el("b", "", name), ` ${detail}`];
}

export function createScreen(screen: HTMLElement) {
  const q = <T extends HTMLElement>(s: string) => screen.querySelector<T>(s) as T;
  const head = q("[data-head]");
  const line = q("[data-line]");
  const files = [...screen.querySelectorAll<HTMLElement>(".ph-boot-files li")];
  const bar = q(".ph-boot-bar i");
  const thread = q("[data-thread]");
  const log = q(".ph-chat-log");
  const input = q("[data-input]");
  const send = q(".ph-chat-send");

  const mode = (m: "boot" | "chat") => {
    screen.dataset.mode = m;
  };
  const empty = () =>
    log.replaceChildren(
      el(
        "div",
        "ph-chat-empty",
        el("b", "", "Start a conversation"),
        "Ask anything below. The reply streams in here.",
      ),
    );

  return {
    /** the idle machine: nothing ticked, the chat cleared behind it */
    reset() {
      mode("boot");
      head.textContent = "no agent loaded";
      line.textContent = "insert your files to start an agent";
      for (const f of files) f.removeAttribute("data-on");
      bar.style.width = "0";
      thread.textContent = "New conversation";
      input.textContent = "";
      input.removeAttribute("data-typing");
      input.removeAttribute("data-overflow");
      send.removeAttribute("data-ready");
      empty();
    },
    say(h: string, l: string) {
      head.textContent = h;
      line.textContent = l;
    },
    loaded(k: number) {
      files[k]?.setAttribute("data-on", "");
      bar.style.width = `${((k + 1) / FILES.length) * 100}%`;
    },
    chat: () => mode("chat"),
    type(text: string) {
      input.setAttribute("data-typing", "");
      input.textContent = text;
      send.toggleAttribute("data-ready", text.length > 0);
      // once the line outgrows the box, its end stays in view
      input.toggleAttribute("data-overflow", input.scrollWidth > input.clientWidth);
    },
    send,
    /** the typed message goes up as the reader's bubble */
    sent(text: string) {
      log.replaceChildren(el("div", "ph-chat-you", text));
      input.textContent = "";
      input.removeAttribute("data-typing");
      input.removeAttribute("data-overflow");
      send.removeAttribute("data-ready");
    },
    /** the agent's turn, thinking until it has something to say */
    agent() {
      const turn = el(
        "div",
        "ph-chat-agent",
        el("span", "ph-spin"),
        el("span", "ph-shimmer", "Thinking…"),
      );
      log.append(turn);
      return turn;
    },
    /** a tool call above the agent's turn; returns a setter for its later states */
    step(turn: HTMLElement, state: "run" | "ok" | "wait", name: string, detail: string) {
      const row = el("div", "ph-chat-step", ...stepParts(state, name, detail));
      turn.before(row);
      return (s: "run" | "ok" | "wait", d: string) => row.replaceChildren(...stepParts(s, name, d));
    },
    /** Studio's approval card; returns the card and its Approve button */
    approval(turn: HTMLElement) {
      const approve = el("span", "ph-chat-btn ph-chat-btn-primary", "Approve tool call");
      const card = el(
        "div",
        "ph-chat-approval",
        el("b", "", "Approval required"),
        el("p", "", el("span", "", "Tool call: "), el("code", "", TOOL.name), ` · ${TOOL.reason}`),
        el("span", "ph-chat-btns", approve, el("span", "ph-chat-btn", "Deny tool call")),
      );
      turn.before(card);
      turn.hidden = true;
      /** the decision, shown on the card until the tool has run */
      const approved = () =>
        card.replaceChildren(
          el("b", "ph-step-ok", "✓ Approved"),
          el("p", "", el("code", "", TOOL.name), " will run."),
        );
      return { card, approve, approved };
    },
    /** the reply, streamed in: call with more of it each time */
    answer(turn: HTMLElement, text: string, done = false) {
      turn.hidden = false;
      turn.className = "ph-chat-answer";
      turn.replaceChildren(text, ...(done ? [] : [el("span", "ph-caret")]));
    },
    titled: () => {
      thread.textContent = THREAD;
    },
    /** the whole exchange at once, for reduced motion */
    finished(ask: string) {
      mode("chat");
      thread.textContent = THREAD;
      log.replaceChildren(
        el("div", "ph-chat-you", ask),
        el("div", "ph-chat-step", ...stepParts("ok", "load_skill", "triage")),
        el("div", "ph-chat-step", ...stepParts("ok", TOOL.name, `→ ${TOOL_RESULT}`)),
        el("p", "ph-chat-answer", ANSWER),
      );
    },
  };
}
