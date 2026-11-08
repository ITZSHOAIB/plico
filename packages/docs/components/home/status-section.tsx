import { Heading } from "./window";

const columns = [
  {
    title: "Works today",
    items: [
      "Project folder and validation",
      "Scripted runs, evals and readiness checks",
      "Event log, HTTP API and Studio",
      "Provider-backed chat with streaming, approvals and cancel",
      "Artifact workspace with versions, diffs and exports",
      "Threads",
    ],
  },
  {
    title: "Up next",
    items: ["Publish to npm", ".env loading", "Embedding Plico in your own backend"],
  },
  {
    title: "Planned",
    items: ["MCP and memory", "AG-UI and a React kit", "Postgres and multi-worker production"],
  },
];

export function StatusSection() {
  return (
    <section id="status" className="ph-section">
      <Heading seq={4} event="readiness.checked">
        Where Plico is <em>today</em>.
      </Heading>
      <p className="ph-section-lede">
        Plico is in development and not on npm yet. Here is what exists and what does not.
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
