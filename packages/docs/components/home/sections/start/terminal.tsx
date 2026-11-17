"use client";

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { BEAT, play, TICK } from "../../lib/beat";
import { report } from "../../lib/status";
import { Window } from "../../ui/window";
import { COMMAND, lines, PROVIDERS, STAGE } from "./script";

/**
 * `npm create plico@latest` replayed in a window. At the provider question it tours the options
 * until someone takes the keys: arrows and Enter, or a click, pick one and the scaffold finishes
 * with it. The server renders the finished run.
 */
export function Terminal() {
  const [typed, setTyped] = useState(COMMAND.length);
  const [stage, setStage] = useState<number>(STAGE.done);
  const [sel, setSel] = useState(0);
  const [spin, setSpin] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const selected = useRef(0);
  // set once the reader takes over; `picked` once they choose
  const reader = useRef<{ picked?: number } | null>(null);

  const move = useCallback((to: number) => {
    selected.current = to;
    setSel(to);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    return play(el, async (wait) => {
      reader.current = null;
      move(0);
      setStage(STAGE.typing);
      for (let c = 0; c <= COMMAND.length; c++) {
        setTyped(c);
        await wait(45);
      }
      await wait(BEAT);
      for (const next of [STAGE.intro, STAGE.where, STAGE.name, STAGE.provider]) {
        setStage(next);
        await wait(BEAT * 1.5);
      }
      // read through a function: the reader takes over between awaits
      const taken = () => reader.current;
      for (const to of [1, 2, 1, 0]) {
        if (taken()) break;
        move(to);
        await wait(BEAT);
      }
      while (taken() && taken()?.picked === undefined) await wait(100);
      move(taken()?.picked ?? 0);
      setStage(STAGE.chosen);
      report(el, `provider ${PROVIDERS[selected.current]}`);
      await wait(BEAT);
      setStage(STAGE.creating);
      for (let i = 0; i < 8; i++) {
        setSpin(i);
        await wait(TICK);
      }
      setStage(STAGE.done);
      report(el, "Generated my-plico");
      await wait(BEAT * 12);
    });
  }, [move]);

  const asking = stage === STAGE.provider;
  const take = () => {
    reader.current ??= {};
    return reader.current;
  };
  const choose = (i: number) => {
    move(i);
    take().picked = i;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!asking) return;
    const n = PROVIDERS.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      take();
      move((selected.current + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(selected.current);
    }
  };

  return (
    <div ref={host}>
      <Window title="~/projects" className="ph-term">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys mirror the option buttons */}
        <div className="ph-term-screen" onKeyDown={onKey}>
          <p>
            <span className="ph-dim">$ </span>
            {COMMAND.slice(0, typed)}
            {stage === STAGE.typing ? <span className="ph-caret" aria-hidden /> : null}
          </p>
          {lines(stage, sel, spin).map((line, i) =>
            line.option === undefined ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
              <p key={i} data-tone={line.tone}>
                <span className="ph-term-bar">{line.bar}</span> {line.text}
              </p>
            ) : (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                key={i}
                type="button"
                data-tone={line.tone}
                aria-pressed={line.option === sel}
                onClick={() => choose(line.option as number)}
              >
                <span className="ph-term-bar">{line.bar}</span> {line.text}
              </button>
            ),
          )}
          {asking ? <p className="ph-term-hint">↑↓ to move, Enter or click to choose</p> : null}
        </div>
      </Window>
    </div>
  );
}
