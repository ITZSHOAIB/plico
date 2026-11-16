"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { gitConfig } from "@/lib/shared";
import { Figure, FigureHeader, Plate } from "../../ui/figure";
import { createAscii, wordmark } from "./ascii";
import { Terminal } from "./terminal";

const ART = wordmark("plico");

/** The call to start: the scaffold replayed, the way in, and the wordmark set in ASCII */
export function Start() {
  const base = useRef<HTMLPreElement>(null);
  const live = useRef<HTMLPreElement>(null);
  useEffect(
    () => (base.current && live.current ? createAscii(base.current, live.current, ART) : undefined),
    [],
  );

  return (
    <Figure id="start" label="Start" status="run.completed · your turn" className="ph-start">
      <div className="ph-start-grid">
        <div>
          <FigureHeader
            plate={<Plate seq={6}>run.completed</Plate>}
            lede="Scaffold a project with one command and run it with a scripted model. No API key needed."
          >
            Your agent is <em>one folder</em> away.
          </FigureHeader>
          <div className="ph-actions">
            <Link href="/docs/quickstart" className="ph-btn ph-btn-primary">
              Get started
            </Link>
            <a href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`} className="ph-btn">
              View on GitHub
            </a>
          </div>
          <p className="ph-foot">
            Agents: read <a href="/llms.txt">/llms.txt</a>, or send{" "}
            <code>Accept: text/markdown</code> to any docs page.
          </p>
        </div>
        <Terminal />
      </div>
      <div className="ph-ascii" role="img" aria-label="plico">
        <pre ref={base} aria-hidden>
          {ART.join("\n")}
        </pre>
        <pre ref={live} aria-hidden className="ph-ascii-live" />
      </div>
    </Figure>
  );
}
