"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BEAT, play, TICK } from "../../lib/beat";
import { report } from "../../lib/status";
import { Figure, FigureHeader, Plate } from "../../ui/figure";
import { Window } from "../../ui/window";
import { RUN_ID, runEvents, views } from "./data";
import { Cli, Http, Studio } from "./readouts";
import { createTape } from "./tape";

const ALL = runEvents.length;
const BLOCKS = runEvents.map((e) => {
  const seq = String(e.sequence).padStart(2, "0");
  return { label: `${seq} ${e.type}`, short: seq };
});

/**
 * The log as tape. The runtime punches each event, the strip steps past the read gate, and a
 * bus carries what it read to the CLI, the API and Studio together. The server renders the
 * finished run on the strip and in every view.
 */
export function Views() {
  const [read, setRead] = useState(ALL);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const canvas = el?.querySelector("canvas");
    if (!el || !canvas) return;
    const tape = createTape(
      canvas,
      () => [...el.querySelectorAll<HTMLElement>(".ph-view")],
      BLOCKS,
    );
    const stop = play(el, async (wait) => {
      tape.reset();
      setRead(0);
      tape.running(true);
      try {
        await wait(BEAT * 2);
        for (const [k, event] of runEvents.entries()) {
          tape.punch(k, TICK * 5);
          report(el, `${event.type} · seq ${event.sequence}`);
          await wait(TICK * 6);
          tape.advance(BEAT * 1.5);
          await wait(BEAT * 0.5);
          tape.read(BEAT * 1.2);
          await wait(BEAT * 1.2);
          setRead(k + 1);
          await wait(BEAT);
        }
        report(el, `read ${ALL} events · cli, http, studio`);
        await wait(BEAT * 10);
      } finally {
        tape.running(false);
      }
    });
    return () => {
      stop();
      tape.destroy();
    };
  }, []);

  const seen = runEvents.slice(0, read);
  return (
    <Figure id="events" label="Events" status={`run ${RUN_ID} · 4 events`}>
      <FigureHeader
        plate={<Plate seq={3}>run.started</Plate>}
        lede="Every run writes the same durable log. The CLI, the API and Studio all read it, so what you see in one place is exactly what happened."
      >
        One run, one event log, <em>many views</em>.
      </FigureHeader>

      <div ref={host} className="ph-events">
        <canvas aria-hidden className="ph-tape" />
        <div className="ph-views">
          {views.map((v) => (
            <div key={v.port} className="ph-view">
              <Window title={v.name}>
                <div className="ph-view-screen">
                  {v.port === "cli" ? (
                    <Cli seen={seen} />
                  ) : v.port === "http" ? (
                    <Http seen={seen} />
                  ) : (
                    <Studio seen={seen} />
                  )}
                </div>
              </Window>
              <Link href={v.href} className="ph-view-foot ph-invert">
                <code>$ {v.command}</code>
                <span>{v.text}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </Figure>
  );
}
