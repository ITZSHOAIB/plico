/**
 * Hero art: a paper tri-fold that opens once to show a project. "Plico" is Latin for
 * "I fold"; the folded sheet is the agent, the panels are the files it is made of.
 */

const panels = [
  {
    side: "left",
    path: "agent.md",
    lines: ["# Support agent", "", "Help the team triage", "support requests."],
  },
  {
    side: "middle",
    path: "skills/triage/SKILL.md",
    lines: [
      "# Triage a request",
      "",
      "1. Read the issue.",
      "2. Decide what's needed.",
      "3. Open a ticket.",
    ],
  },
  {
    side: "right",
    path: "tools/create-ticket.tool.ts",
    lines: [
      "defineTool({",
      ' name: "create_ticket",',
      " handler: async () =>",
      "  ({ ticketId }),",
      "});",
    ],
  },
] as const;

export function Fold() {
  return (
    <figure className="ph-fold">
      <div className="ph-fold-sheet">
        {panels.map((p) => (
          <div key={p.path} className={`ph-fold-panel ph-fold-${p.side}`}>
            <div className="ph-fold-face">
              <p className="ph-fold-path">{p.path}</p>
              <pre>{p.lines.join("\n")}</pre>
            </div>
            {p.side === "left" ? (
              <div className="ph-fold-face ph-fold-cover" aria-hidden>
                <span className="ph-fold-mark">P</span>
                <span>my-agent/</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="ph-fold-run" aria-hidden>
        <span>$ plico run --dry my-agent</span>
        <span>
          run.completed: <em>completed</em>
        </span>
      </p>
      <figcaption>
        <i>plico</i> (Latin): <em>I fold</em>. Your prompts and tools, folded into an agent.
      </figcaption>
    </figure>
  );
}
