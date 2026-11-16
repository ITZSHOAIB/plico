import Link from "next/link";
import { Command } from "../ui/command";
import { Figure } from "../ui/figure";
import { Glitch } from "../ui/glitch";
import { Stage } from "./stage";

const providers = [
  { name: "Anthropic", href: "/docs/providers" },
  { name: "OpenAI", href: "/docs/providers" },
  { name: "Google", href: "/docs/providers" },
  { name: "any OpenAI-compatible model", href: "/docs/providers" },
];

/** A screen below the menu: the pitch beside a computer running the harness, a ruler along its foot */
export function Hero() {
  return (
    <Figure id="plico" label="Plico" status="loading project" className="ph-hero">
      <div className="ph-hero-copy">
        <p className="ph-badge">
          <span className="ph-lamp" aria-hidden />
          developer preview · 0.1 on npm
        </p>
        <h1>
          Bring prompts and tools.
          <br />
          <em>
            Plico handles <Glitch delay={1150}>the harness</Glitch>.
          </em>
        </h1>
        <p className="ph-hero-lede">
          Write the job in Markdown and the tools in TypeScript. Plico gives your agent durable
          runs, an event log, approvals, artifacts, evals and a local Studio, inside your backend or
          on its own.
        </p>
        <div className="ph-actions">
          <Link href="/docs/quickstart" className="ph-btn ph-btn-primary">
            Get started
          </Link>
          <Command command="npm create plico@latest my-agent" />
          <Link href="/docs" className="ph-link">
            Read the docs
          </Link>
        </div>
        <p className="ph-hero-runs">
          Works with{" "}
          {providers.map((p, i) => (
            <span key={p.name}>
              {i > 0 ? " · " : null}
              <Link href={p.href} className="ph-invert">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <Stage />
      <div aria-hidden className="ph-ruler" />
    </Figure>
  );
}
