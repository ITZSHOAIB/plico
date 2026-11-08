import Link from "next/link";
import { gitConfig } from "@/lib/shared";
import { Heading } from "./window";

export function StartSection() {
  return (
    <section id="start" className="ph-section ph-start">
      <Heading seq={5} event="run.completed">
        Your agent is <em>one folder</em> away.
      </Heading>
      <p className="ph-section-lede">
        Build the repository, scaffold a project and run it with a scripted model. No API key
        needed.
      </p>
      <div className="ph-actions">
        <Link href="/docs/quickstart" className="ph-btn ph-btn-primary">
          Get started
        </Link>
        <a href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`} className="ph-btn">
          View on GitHub
        </a>
      </div>
      <p className="ph-foot">
        Agents: read <Link href="/llms.txt">/llms.txt</Link>, or send{" "}
        <code>Accept: text/markdown</code> to any docs page.
      </p>
    </section>
  );
}
