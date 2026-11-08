import { Sparkles } from "lucide-react";

/** The agent's avatar. Pulses softly while the agent is working on a reply. */
export function AgentMark({ active = false }: { active?: boolean }) {
  return (
    <span
      data-active={active || undefined}
      className="agent-mark relative grid size-full place-items-center rounded-lg text-on-accent"
    >
      <Sparkles size={15} strokeWidth={2} />
    </span>
  );
}
