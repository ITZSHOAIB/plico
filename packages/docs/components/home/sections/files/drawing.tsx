import type { CSSProperties } from "react";

/**
 * The project as an exploded assembly drawing: one isometric plate per part of the folder, the
 * anchor at the foot, a callout to each. Plates rise from the assembled stack to their exploded
 * places; a lit plate is one `loadProject` has read. Decoration: the tabs beside it are the
 * control.
 */
export interface Part {
  name: string;
  note: string;
  folder?: boolean;
  /** the source tab this plate opens, if it has one */
  tab?: number;
}

const CX = 150;
const A = 112;
const B = 56;
const T = 9;
const FOOT = 392;
/** how far each plate stands above the one below it, exploded */
export const RISE = 46;

export function Drawing({
  parts,
  up,
  lit,
  active,
  onPick,
}: {
  parts: Part[];
  up: number;
  lit: number;
  active: number;
  onPick: (tab: number) => void;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 500 462" className="ph-drawing">
      {parts.map((p, i) => {
        const y = FOOT - i * T;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: the tabs are the control; a plate is a shortcut to one
          <g
            key={p.name}
            className="ph-plate-g"
            data-up={i < up ? "" : undefined}
            data-lit={i < lit ? "" : undefined}
            data-scan={i === lit - 1 ? "" : undefined}
            data-active={p.tab === active ? "" : undefined}
            data-pick={p.tab === undefined ? undefined : ""}
            style={{ "--rise": `${-i * (RISE - T)}px` } as CSSProperties}
            onClick={p.tab === undefined ? undefined : () => onPick(p.tab as number)}
          >
            <Slab y={y} folder={p.folder} />
            <text
              className="ph-plate-name"
              transform={`matrix(1 0.5 -1 0.5 ${CX - A * 0.5} ${y - B * 0.12})`}
            >
              {p.name}
            </text>
            <g className="ph-callout">
              <path d={`M${CX + A + 6} ${y}h88`} pathLength={1} />
              <rect x={CX + A + 2} y={y - 2} width={4} height={4} />
              <text x={CX + A + 102} y={y + 4} className="ph-callout-name">
                {String(i + 1).padStart(2, "0")} {p.name}
              </text>
              <text x={CX + A + 102} y={y + 19} className="ph-callout-note">
                {p.note}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** A plate in isometric: top face, two sides, and a tab on the back edge if it is a folder */
function Slab({ y, folder }: { y: number; folder?: boolean }) {
  const [l, t, r, b] = [`${CX - A},${y}`, `${CX},${y - B}`, `${CX + A},${y}`, `${CX},${y + B}`];
  const down = (p: string) => {
    const [x, py] = p.split(",").map(Number);
    return `${x},${py + T}`;
  };
  // the tab: a strip along the back-left edge, a fifth to a half of the way along
  const edge = (f: number, lift = 0) => `${CX - A + A * f},${y - B * f - lift}`;
  return (
    <>
      <polygon className="ph-slab-left" points={`${l} ${b} ${down(b)} ${down(l)}`} />
      <polygon className="ph-slab-right" points={`${b} ${r} ${down(r)} ${down(b)}`} />
      {folder ? (
        <polygon
          className="ph-slab-tab"
          points={`${edge(0.12)} ${edge(0.17, 7)} ${edge(0.45, 7)} ${edge(0.5)}`}
        />
      ) : null}
      <polygon className="ph-slab-top" points={`${l} ${t} ${r} ${b}`} />
    </>
  );
}
