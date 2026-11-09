import { Heading } from "./window";

const columns = [
  {
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
    title: "Up next",
    items: ["MCP and external tools", "Context compaction", "Eval scorers"],
  },
  {
    title: "Planned",
    items: [
      "Agent memory",
      "Multi-agent workflows",
      "AG-UI and a React kit",
      "Postgres and multi-worker production",
    ],
  },
];

export function StatusSection() {
  return (
    <section id="status" className="ph-section">
      <Heading seq={4} event="readiness.checked">
        Where Plico is <em>today</em>.
      </Heading>
      <p className="ph-section-lede">
        Plico is a developer preview, published on npm at 0.1. Here is what exists and what does
        not.
      </p>
      <div className="ph-grid ph-grid-3">
        {columns.map((c) => (
          <div key={c.title} className="ph-card ph-card-static">
            <h3>{c.title}</h3>
            <ul>
              {c.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
