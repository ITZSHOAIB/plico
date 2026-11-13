import Link from "next/link";
import { Fold } from "./fold";

export function Hero() {
  return (
    <section id="plico" className="ph-hero">
      <div className="ph-hero-copy">
        <p className="ph-badge">
          <i aria-hidden />
          Developer preview · 0.1 on npm
        </p>
        <h1>
          Bring prompts and tools. <br />
          <em>Plico handles the harness.</em>
        </h1>
        <p className="ph-lede">
          Write the job in Markdown and the tools in TypeScript. Plico gives your agent durable
          runs, an event log, approvals, artifacts, evals and a local Studio, inside your backend or
          on its own.
        </p>
        <div className="ph-actions">
          <Link href="/docs/quickstart" className="ph-btn ph-btn-primary">
            Get started
          </Link>
          <Link href="/docs" className="ph-btn">
            Read the docs
          </Link>
        </div>
        <div className="ph-command">
          <span className="ph-command-label">get started</span>
          <code>
            <span aria-hidden>$ </span>npm create plico@latest my-agent
          </code>
          <Link href="/docs/quickstart">Follow the quickstart</Link>
        </div>
      </div>
      <div className="ph-hero-art">
        <Fold />
      </div>
    </section>
  );
}
