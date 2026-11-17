import { Figure, FigureHeader, Plate } from "../../ui/figure";
import { Window } from "../../ui/window";
import { Board, type Row } from "./board";

const groups = [
  {
    state: "lit",
    word: "LIVE",
    title: "Works today",
    items: [
      "Project folder and validation",
      "Scripted runs, evals and readiness checks",
      "Event log, HTTP API and Studio",
      "Provider-backed chat with streaming, approvals and cancel",
      "Anthropic, OpenAI, Google or any OpenAI-compatible model",
      "Artifact workspace with versions, diffs and exports",
      "Threads, and embedding in your own backend",
      "OpenTelemetry tracing",
    ],
  },
  {
    state: "dim",
    word: "NEXT",
    title: "Up next",
    items: ["MCP and external tools", "Context compaction", "Eval scorers"],
  },
  {
    state: "off",
    word: "PLANNED",
    title: "Planned",
    items: [
      "Agent memory",
      "Multi-agent workflows",
      "AG-UI and a React kit",
      "Postgres and multi-worker production",
    ],
  },
] as const;

const rows: Row[] = groups.flatMap((g) =>
  g.items.map((item) => ({ item, state: g.state, word: g.word, title: g.title })),
);

/** What exists and what does not, as a departures board whose status flaps settle on screen */
export function Today() {
  return (
    <Figure id="today" label="Today" status="readiness.checked · developer preview">
      <FigureHeader
        plate={<Plate seq={5}>readiness.checked</Plate>}
        lede="Plico is a developer preview, published on npm at 0.1. Here is what exists and what does not."
      >
        Where Plico is <em>today</em>.
      </FigureHeader>
      <Window title="status · 0.1" className="ph-board">
        <p className="ph-board-totals">
          {groups.map((g) => (
            <span key={g.word} data-state={g.state}>
              <b>{String(g.items.length).padStart(2, "0")}</b> {g.title.toLowerCase()}
            </span>
          ))}
        </p>
        <Board rows={rows} />
      </Window>
    </Figure>
  );
}
