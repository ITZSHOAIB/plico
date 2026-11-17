"use client";

import { Bay, flag, useStep } from "./bay";

const TURNS = [
  { x: 52, y: 52, who: "user" },
  { x: 100, y: 96, who: "agent" },
  { x: 148, y: 52, who: "user" },
  { x: 196, y: 96, who: "agent" },
];

/** A thread drawn through its turns: each run picks it up where the last left off */
export function ThreadMachine() {
  const [ref, step] = useStep(TURNS.length + 1, 600);
  const d = `M12 74${TURNS.map((t) => `L${t.x} ${t.y}`).join("")}L230 74`;
  return (
    <Bay ref={ref}>
      <path
        className="ph-k-thread"
        d={d}
        pathLength={1}
        style={{ strokeDashoffset: 1 - step / TURNS.length }}
      />
      {TURNS.map((t, i) => (
        <g key={t.x} data-gone={flag(i >= step)} className="ph-k-bead">
          <rect
            x={t.x - 9}
            y={t.y - 9}
            width="18"
            height="18"
            data-who={t.who}
            className="ph-k-card"
          />
          <text
            className="ph-k-note"
            x={t.x}
            y={t.who === "user" ? t.y - 16 : t.y + 24}
            textAnchor="middle"
          >
            {t.who === "agent" ? `run ${(i + 1) / 2}` : t.who}
          </text>
        </g>
      ))}
    </Bay>
  );
}

const CASES = ["smoke", "creates-ticket", "asks-approval"];

/** Scripted cases ticked off one by one, no API key needed */
export function EvalMachine() {
  const [ref, step] = useStep(CASES.length + 1, 650);
  return (
    <Bay ref={ref}>
      <text className="ph-k-note" x="30" y="24">
        $ plico eval
      </text>
      {CASES.map((c, i) => {
        const y = 40 + i * 26;
        const done = i < step;
        return (
          <g key={c}>
            <rect className="ph-k-card" x="30" y={y} width="14" height="14" />
            <path
              className="ph-k-tick"
              d={`M33 ${y + 7}l3 4 6-8`}
              pathLength={1}
              style={{ strokeDashoffset: done ? 0 : 1 }}
            />
            <text className="ph-k-label" x="54" y={y + 11}>
              {c}
            </text>
            <rect className="ph-k-track" x="150" y={y + 4} width="60" height="6" />
            <rect
              className="ph-k-fill"
              x="150"
              y={y + 4}
              width="60"
              height="6"
              style={{ transform: `scaleX(${done ? 1 : 0})` }}
            />
          </g>
        );
      })}
      <g data-gone={flag(step < CASES.length)} className="ph-k-stamp">
        <rect x="140" y="112" width="70" height="18" />
        <text className="ph-k-label" x="175" y="124" textAnchor="middle">
          3/3 passed
        </text>
      </g>
    </Bay>
  );
}

const CHECKS = ["project", "tools", "evals", "provider", "approval-policy", "persistence"];

/** The preflight panel: a switch for each readiness check, thrown one by one */
export function ReadinessMachine() {
  const [ref, step] = useStep(CHECKS.length + 1, 380);
  return (
    <Bay ref={ref}>
      {CHECKS.map((c, i) => {
        const x = i < 3 ? 22 : 128;
        const y = 34 + (i % 3) * 30;
        return (
          <g key={c} className="ph-k-switch" data-on={flag(i < step)}>
            <rect className="ph-k-card" x={x} y={y} width="24" height="12" rx="6" />
            <circle
              cx={x + 6}
              cy={y + 6}
              r="4"
              style={{ transform: `translateX(${i < step ? 12 : 0}px)` }}
            />
            <text className="ph-k-label" x={x + 30} y={y + 9}>
              {c}
            </text>
          </g>
        );
      })}
    </Bay>
  );
}
