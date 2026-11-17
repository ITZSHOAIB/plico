import Link from "next/link";
import type { ComponentType } from "react";
import { Figure, FigureHeader, Plate } from "../../ui/figure";
import { ApprovalMachine, ArtifactMachine, ToolMachine } from "./machines-a";
import { EvalMachine, ReadinessMachine, ThreadMachine } from "./machines-b";

const kit: { name: string; text: string; href: string; line: string; Machine: ComponentType }[] = [
  {
    name: "Tools",
    text: "Typed TypeScript handlers with schemas, capabilities and idempotency keys.",
    href: "/docs/tools",
    line: "tool.result TCK-1042",
    Machine: ToolMachine,
  },
  {
    name: "Approvals",
    text: "Pause a tool call until someone approves it in Studio or over the API.",
    href: "/docs/approvals",
    line: "approval.decided approved",
    Machine: ApprovalMachine,
  },
  {
    name: "Artifacts",
    text: "A versioned workspace with diffs and exports for what a run produces.",
    href: "/docs/artifacts",
    line: "artifact.file.written v2",
    Machine: ArtifactMachine,
  },
  {
    name: "Threads",
    text: "Multi-turn conversations stored next to the runs that belong to them.",
    href: "/docs/threads",
    line: "thread · 2 runs",
    Machine: ThreadMachine,
  },
  {
    name: "Evals",
    text: "Scripted scenarios in evals/ that check the agent without an API key.",
    href: "/docs/evals",
    line: "plico eval · 3 passed",
    Machine: EvalMachine,
  },
  {
    name: "Readiness",
    text: "A checklist that tells you what is missing before you ship the agent.",
    href: "/docs/cli",
    line: "plico readiness",
    Machine: ReadinessMachine,
  },
];

/** The harness as a bank of six machines, each a link to its docs */
export function Kit() {
  return (
    <Figure id="kit" label="Kit" status="tools.discovered · 6 parts">
      <FigureHeader
        plate={<Plate seq={4}>tools.discovered</Plate>}
        lede="You write the files. Plico supplies what usually takes a framework, a database and a few weekends."
      >
        The harness, <em>included</em>.
      </FigureHeader>
      <div className="ph-kit">
        {kit.map(({ name, text, href, line, Machine }) => (
          <Link key={name} href={href} className="ph-kit-cell">
            <Machine />
            <div className="ph-kit-body">
              <h3>{name}</h3>
              <p>{text}</p>
            </div>
            <p className="ph-kit-foot">
              <i className="ph-lamp" aria-hidden />
              <span>{line}</span>
              <span aria-hidden>→</span>
            </p>
          </Link>
        ))}
      </div>
    </Figure>
  );
}
