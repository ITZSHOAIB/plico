"use client";

import { useEffect, useRef, useState } from "react";
import { events, sources } from "./files-data";
import { Heading, Panel } from "./window";

const typeMs = 18;
const holdMs = 2600;
const last = sources.length - 1;

export function FilesSection() {
  const [active, setActive] = useState(0);
  const [chars, setChars] = useState(Number.POSITIVE_INFINITY);
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  const source = sources[active];
  const text = source.lines.join("\n");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Type the active file, then advance to the next tab while the section is on screen.
  useEffect(() => {
    if (!visible || !auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (chars < text.length) {
      const t = setTimeout(() => setChars((c) => c + 2), typeMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        const next = (active + 1) % sources.length;
        setActive(next);
        setChars(0);
      },
      active === last ? holdMs * 2 : holdMs,
    );
    return () => clearTimeout(t);
  }, [visible, auto, chars, text.length, active]);

  // Start the animation from a clean slate the first time the section appears.
  const started = useRef(false);
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setChars(0);
  }, [visible]);

  const typed = text.slice(0, chars);
  const typing = chars < text.length;
  // The run streams its events while the tool file lands; a typed project shows the full log.
  let shown = events.length;
  if (Number.isFinite(chars)) {
    shown =
      active === last ? Math.ceil((Math.min(chars, text.length) / text.length) * events.length) : 0;
  }

  return (
    <section id="files" ref={ref} className="ph-section">
      <Heading seq={1} event="project.loaded">
        An agent is <em>just files</em>. The harness comes with Plico.
      </Heading>
      <p className="ph-section-lede">
        Describe the job in Markdown, teach a workflow with a skill, give it an action with a
        TypeScript tool. Plico loads the folder and handles the run around it.
      </p>

      <div className="ph-files">
        <Panel title="my-agent/" meta={source.label} className="ph-editor">
          <div className="ph-tabs" role="tablist" aria-label="Project files">
            {sources.map((s, i) => (
              <button
                key={s.path}
                type="button"
                role="tab"
                aria-selected={i === active}
                className="ph-tab"
                onClick={() => {
                  setAuto(false);
                  setActive(i);
                  setChars(Number.POSITIVE_INFINITY);
                }}
              >
                {s.path}
              </button>
            ))}
          </div>
          <pre className="ph-code">
            <code>
              {typed}
              {typing ? <span className="ph-caret" aria-hidden /> : null}
            </code>
          </pre>
        </Panel>

        <span className="ph-wire" aria-hidden />

        <Panel title="plico events" meta="excerpt" className="ph-events">
          <ol>
            {events.map((e, i) => (
              <li key={e.type} data-on={i < shown}>
                <span className="ph-event-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="ph-event-type">{e.type}</span>
                <span className="ph-event-detail">{e.detail}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </section>
  );
}
