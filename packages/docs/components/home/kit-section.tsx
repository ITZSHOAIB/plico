import Link from "next/link";
import { Heading } from "./window";

const kit = [
  {
    name: "Tools",
    text: "Typed TypeScript handlers with schemas, capabilities and idempotency keys.",
    href: "/docs/tools",
  },
  {
    name: "Approvals",
    text: "Pause a tool call until someone approves it in Studio or over the API.",
    href: "/docs/approvals",
  },
  {
    name: "Artifacts",
    text: "A versioned workspace with diffs and exports for what a run produces.",
    href: "/docs/artifacts",
  },
  {
    name: "Threads",
    text: "Multi-turn conversations stored next to the runs that belong to them.",
    href: "/docs/threads",
  },
  {
    name: "Evals",
    text: "Scripted scenarios in evals/ that check the agent without an API key.",
    href: "/docs/cli",
  },
  {
    name: "Readiness",
    text: "A checklist that tells you what is missing before you ship the agent.",
    href: "/docs/cli",
  },
];

export function KitSection() {
  return (
    <section id="kit" className="ph-section">
      <Heading seq={3} event="tools.discovered">
        The harness, <em>included</em>.
      </Heading>
      <p className="ph-section-lede">
        You write the files. Plico supplies what usually takes a framework, a database and a few
        weekends.
      </p>
      <div className="ph-grid ph-grid-3">
        {kit.map((k) => (
          <Link key={k.name} href={k.href} className="ph-card">
            <h3>{k.name}</h3>
            <p>{k.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
