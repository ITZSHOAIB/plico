"use client";

import { at, Bay, flag, useStep } from "./bay";

/** A call slides under the press, the typed handler stamps it, a result rolls out */
export function ToolMachine() {
  const [ref, step] = useStep(4, 650);
  return (
    <Bay ref={ref}>
      <path className="ph-k-belt" d="M8 108H232" />
      <path className="ph-k-thin" d="M96 14V58M144 14V58M88 14H152" />
      <text className="ph-k-note" x="150" y="30">
        ticket:write
      </text>
      <g className="ph-k-move" style={at(0, step === 2 ? 22 : 0)}>
        <rect className="ph-k-solid" x="84" y="58" width="72" height="18" />
        <text className="ph-k-label ph-k-inv" x="120" y="70" textAnchor="middle">
          create_ticket
        </text>
      </g>
      <g className="ph-k-move" style={at(step === 0 ? 0 : 76)} data-gone={flag(step === 3)}>
        <rect className="ph-k-card" x="10" y="84" width="68" height="22" />
        <text className="ph-k-label" x="44" y="98" textAnchor="middle">
          {"{ title }"}
        </text>
      </g>
      <g className="ph-k-move" style={at(step === 3 ? 0 : -40)} data-gone={flag(step < 3)}>
        <rect className="ph-k-card" data-tone="accent" x="160" y="84" width="70" height="22" />
        <text className="ph-k-label" x="195" y="98" textAnchor="middle">
          TCK-1042
        </text>
      </g>
    </Bay>
  );
}

/** A tool call waits at the gate; a cursor approves it, the arm lifts, the call goes through */
export function ApprovalMachine() {
  const [ref, step] = useStep(5, 600);
  const open = step >= 3;
  return (
    <Bay ref={ref}>
      <path className="ph-k-belt" d="M8 112H232" />
      <rect className="ph-k-solid" x="146" y="60" width="8" height="52" />
      <circle className="ph-k-lamp" cx="150" cy="54" r="4" data-blink={flag(!open && step > 0)} />
      <g className="ph-k-arm" style={{ transform: `rotate(${open ? 72 : 0}deg)` }}>
        <path className="ph-k-stripe" d="M146 66H58" />
      </g>
      <g className="ph-k-move" style={at([-70, 0, 0, 0, 120][step])}>
        <rect className="ph-k-card" x="40" y="90" width="76" height="20" />
        <text className="ph-k-label" x="78" y="103" textAnchor="middle">
          create_ticket
        </text>
      </g>
      <g data-pressed={flag(step === 2)} data-done={flag(open)} className="ph-k-button">
        <rect x="168" y="16" width="60" height="20" />
        <text className="ph-k-label" x="198" y="29" textAnchor="middle">
          {open ? "Approved" : "Approve"}
        </text>
      </g>
      <g className="ph-k-move" style={at(step >= 2 ? 0 : 50, step >= 2 ? 0 : 60)}>
        <path className="ph-k-cursor" d="M206 26v12l3-3 2 5 2-1-2-5h4z" />
      </g>
    </Bay>
  );
}

/** A file the run wrote, a second version laid over it, the diff, then the export */
export function ArtifactMachine() {
  const [ref, step] = useStep(4, 700);
  return (
    <Bay ref={ref}>
      <Sheet x={44} y={14} tag="v1" />
      <g className="ph-k-move" style={at(step >= 1 ? 0 : 140)} data-gone={flag(step < 1)}>
        <Sheet x={64} y={40} tag="v2" />
        <g className="ph-k-diff" data-on={flag(step >= 2)}>
          <text x="72" y="84">
            - Status: open
          </text>
          <text x="72" y="98" data-tone="accent">
            + Status: escalated
          </text>
          <text x="72" y="112" data-tone="accent">
            + Owner: billing
          </text>
        </g>
      </g>
      <g data-gone={flag(step < 3)} className="ph-k-export">
        <path className="ph-k-thin" d="M196 46V92M188 84l8 8 8-8" />
        <text className="ph-k-note" x="196" y="110" textAnchor="middle">
          export
        </text>
      </g>
    </Bay>
  );
}

function Sheet({ x, y, tag }: { x: number; y: number; tag: string }) {
  return (
    <g>
      <path className="ph-k-card" d={`M${x} ${y}h82l14 14v76h-96z`} />
      <path className="ph-k-thin" d={`M${x + 82} ${y}v14h14`} />
      <text className="ph-k-label" x={x + 8} y={y + 14}>
        tickets/new.md
      </text>
      <text className="ph-k-tag" x={x + 8} y={y + 30}>
        {tag}
      </text>
    </g>
  );
}
