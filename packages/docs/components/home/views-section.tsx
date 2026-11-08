import Link from "next/link";
import { Heading } from "./window";

const views = [
  {
    name: "CLI",
    command: "plico events",
    text: "Print any run's events from the terminal, or replay a whole run offline.",
    href: "/docs/cli",
  },
  {
    name: "HTTP API",
    command: "plico serve",
    text: "A thin native API over the runtime and the event store, for your own tools.",
    href: "/docs/http-api",
  },
  {
    name: "Studio",
    command: "plico serve --studio",
    text: "Watch runs, approve tool calls, chat with the agent and browse artifacts.",
    href: "/docs/studio",
  },
];

export function ViewsSection() {
  return (
    <section id="events" className="ph-section">
      <Heading seq={2} event="run.started">
        One run, one event log, <em>many views</em>.
      </Heading>
      <p className="ph-section-lede">
        Every run writes the same durable log. The CLI, the API and Studio all read it, so what you
        see in one place is exactly what happened.
      </p>
      <div className="ph-grid ph-grid-3">
        {views.map((v) => (
          <Link key={v.name} href={v.href} className="ph-card">
            <h3>{v.name}</h3>
            <code>$ {v.command}</code>
            <p>{v.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
