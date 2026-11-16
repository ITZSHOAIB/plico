"use client";

import { type CSSProperties, useCallback } from "react";
import { Window } from "../ui/window";
import { createRig } from "./rig";
import { ALT, HEAD, KEYS, PARTS, REST } from "./rig-data";

const KEY_IDS = Array.from({ length: KEYS }, (_, i) => `key-${i}`);

/**
 * The hero's art: a computer with every part of the harness plugged into it by a cable, a run's
 * event log scrolling on its screen and each event lighting its part. Then the cables pull out,
 * the parts go back in, and the screen prints what is really there: the Markdown you wrote. The
 * server renders the run under way; the title bar button swaps the two.
 */
export function Stage() {
  const ref = useCallback(
    (stage: HTMLDivElement | null) => (stage ? createRig(stage) : undefined),
    [],
  );
  return (
    <div ref={ref} className="ph-stage">
      <Window
        title={<span data-title="">the harness · running</span>}
        className="ph-rig-window"
        actions={
          <button type="button" className="ph-rig-toggle" data-toggle="">
            show the files
          </button>
        }
      >
        <div className="ph-rig" role="img" aria-label={ALT[0]}>
          <svg className="ph-rig-cables" aria-hidden="true">
            {PARTS.map((p) => (
              <g key={p.id} data-cable={p.id}>
                <path className="ph-cable" pathLength={1} />
                <path className="ph-cable-packet" pathLength={1} />
              </g>
            ))}
          </svg>

          {PARTS.map((p, i) => (
            <div
              key={p.id}
              className="ph-part"
              data-part={p.id}
              data-side={p.side}
              style={{ "--row": (i % 4) + 1 } as CSSProperties}
            >
              <b>
                {p.name}
                <span className="ph-part-lamp" />
              </b>
              <small>{p.detail}</small>
            </div>
          ))}

          <div className="ph-pc">
            <div className="ph-pc-monitor">
              <div className="ph-pc-screen">
                <pre>
                  <span className="ph-pc-cmd">{HEAD[0]}</span>
                  {`\n${[...HEAD.slice(1), ...REST].join("\n")}`}
                </pre>
              </div>
              <div className="ph-pc-chin">
                <span>plico</span>
                <span className="ph-lamp" />
              </div>
            </div>
            <span className="ph-pc-stand" />
            <span className="ph-pc-foot" />
            <span className="ph-pc-keys">
              {KEY_IDS.map((id) => (
                <i key={id} />
              ))}
            </span>
          </div>
        </div>
      </Window>
    </div>
  );
}
