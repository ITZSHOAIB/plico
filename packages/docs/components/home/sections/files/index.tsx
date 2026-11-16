"use client";

import { useEffect, useRef, useState } from "react";
import { config, sources } from "../../files-data";
import { BEAT, play, TICK } from "../../lib/beat";
import { report } from "../../lib/status";
import { Figure, FigureHeader, Plate } from "../../ui/figure";
import { Window } from "../../ui/window";
import { Drawing, type Part } from "./drawing";

const tabs = [config, ...sources];

/** The folder create-plico writes, anchor first: every part the project contract requires */
const parts: Part[] = [
  { name: "plico.config.ts", note: "the anchor", tab: 0 },
  { name: "memory/", note: "project notes", folder: true },
  { name: "artifacts/", note: "what runs write", folder: true },
  { name: "evals/", note: "scripted checks", folder: true },
  { name: "tools/", note: "TypeScript actions", folder: true, tab: 3 },
  { name: "skills/", note: "workflows", folder: true, tab: 2 },
  { name: "agent.md", note: "the job", tab: 1 },
];
const ALL = parts.length;

/**
 * The project as an assembly drawing beside its source. The stack rises apart a plate at a time,
 * then `loadProject` reads it from the anchor up, lighting each plate and opening its file. The
 * server renders it apart, `agent.md` open.
 */
export function Files() {
  const [active, setActive] = useState(1);
  const [up, setUp] = useState(ALL);
  const [lit, setLit] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    stop.current = play(el, async (wait) => {
      setUp(1);
      setLit(0);
      await wait(BEAT * 2);
      for (let i = 2; i <= ALL; i++) {
        setUp(i);
        await wait(TICK * 2);
      }
      await wait(BEAT * 2);
      report(el, "loadProject my-agent/");
      for (const [i, part] of parts.entries()) {
        setLit(i + 1);
        if (part.tab !== undefined) setActive(part.tab);
        report(el, `read ${part.name}`);
        await wait(part.tab === undefined ? BEAT : BEAT * 3);
      }
      report(el, `project.loaded my-agent · ${ALL} parts`);
      await wait(BEAT * 6);
    });
    return () => stop.current();
  }, []);

  const pick = (i: number) => {
    stop.current();
    setUp(ALL);
    setLit(0);
    setActive(i);
  };

  const source = tabs[active];
  return (
    <Figure id="files" label="Files" status="project.loaded my-agent">
      <FigureHeader
        plate={<Plate seq={2}>project.loaded</Plate>}
        lede="Describe the job in Markdown, teach a workflow with a skill, give it an action with a TypeScript tool. Plico loads the folder and handles the run around it."
      >
        An agent is <em>just files</em>. The harness comes with Plico.
      </FigureHeader>

      <div ref={host} className="ph-files">
        <Drawing parts={parts} up={up} lit={lit} active={active} onPick={pick} />
        <Window title="my-agent/" className="ph-editor">
          <div className="ph-tabs" role="tablist" aria-label="Project files">
            {tabs.map((s, i) => (
              <button
                key={s.path}
                type="button"
                role="tab"
                aria-selected={i === active}
                className="ph-tab"
                onClick={() => pick(i)}
              >
                {s.path}
              </button>
            ))}
          </div>
          <p className="ph-editor-label">{source.label}</p>
          <pre className="ph-code">
            <code>{source.lines.join("\n")}</code>
          </pre>
        </Window>
      </div>
    </Figure>
  );
}
