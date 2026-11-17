"use client";

import { useCallback } from "react";
import { Window } from "../ui/window";
import { Disk } from "./disk";
import { createRig } from "./rig";
import { ALT, FILES, KEYS, MODEL, SPACE, TITLES } from "./rig-data";

const KEY_IDS = Array.from({ length: KEYS }, (_, i) => `key-${i}`);

/**
 * The hero's art: the agent's files on floppy disks in a `my-agent/` tray beside an idle computer.
 * The disks go into the drive one by one, the screen boots into a chat like Plico Studio's, and
 * the agent works a request through a skill, an approval and a tool. The server renders the idle
 * machine; with reduced motion the finished chat shows instead.
 */
export function Stage() {
  const ref = useCallback(
    (stage: HTMLDivElement | null) => (stage ? createRig(stage) : undefined),
    [],
  );
  return (
    <div ref={ref} className="ph-stage">
      <Window title={<span data-title="">{TITLES.idle}</span>} className="ph-rig-window">
        <div className="ph-rig" role="img" aria-label={ALT[0]}>
          <div className="ph-tray">
            <b>my-agent/</b>
            <div className="ph-tray-bays">
              {FILES.map((f) => (
                <div key={f.name} className="ph-tray-bay">
                  <small>{f.role}</small>
                  <Disk file={f} />
                </div>
              ))}
            </div>
          </div>

          <div className="ph-pc">
            <div className="ph-pc-monitor">
              <div className="ph-pc-screen" data-mode="boot">
                <Boot />
                <Chat />
              </div>
              <div className="ph-pc-chin">
                <span>PLICO</span>
                <span className="ph-pc-drive">
                  <span className="ph-pc-slot" />
                  <span className="ph-pc-led" />
                </span>
              </div>
            </div>
            <span className="ph-pc-stand" />
            <span className="ph-pc-foot" />
            <span className="ph-pc-keys">
              {KEY_IDS.map((id, i) => (
                <i key={id} className={i === SPACE ? "ph-pc-space" : undefined} />
              ))}
            </span>
          </div>

          <svg className="ph-pointer" viewBox="0 0 12 18" aria-hidden="true">
            <path d="M1 1v14l3.5-3.5 2.5 5.5 2-1-2.5-5.5h5z" />
          </svg>
        </div>
      </Window>
    </div>
  );
}

/** The screen before the files go in: a waiting machine and a checklist of what it needs */
function Boot() {
  return (
    <div className="ph-boot">
      <span className="ph-boot-orb">
        {[0, 1, 2, 7, 8, 3, 6, 5, 4].map((n) => (
          <i key={n} style={{ animationDelay: `${n * 120}ms` }} />
        ))}
      </span>
      <b data-head="">no agent loaded</b>
      <span className="ph-shimmer" data-line="">
        insert your files to start an agent
      </span>
      <ul className="ph-boot-files">
        {FILES.map((f) => (
          <li key={f.name}>
            <span>{f.name}</span>
            <em>{f.role}</em>
          </li>
        ))}
      </ul>
      <span className="ph-boot-bar">
        <i />
      </span>
    </div>
  );
}

/** The screen once the agent is loaded: a chat laid out like Plico Studio's */
function Chat() {
  return (
    <div className="ph-chat">
      <div className="ph-chat-head">
        <span>
          <b data-thread="">New conversation</b>
          <small>Try your agent and inspect every run</small>
        </span>
        <span className="ph-chat-model">{MODEL}</span>
      </div>
      <div className="ph-chat-log" />
      <div className="ph-chat-composer">
        <span data-input="" />
        <i className="ph-chat-send">↑</i>
      </div>
    </div>
  );
}
