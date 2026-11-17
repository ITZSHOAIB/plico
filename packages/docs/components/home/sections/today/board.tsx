"use client";

import { useCallback, useState } from "react";
import { reduced } from "../../lib/beat";

export type Row = { item: string; state: string; word: string; title: string };

const ALPHA = " ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WIDTH = 7;
const FLIP = 45;
/** ticks between one row's flaps starting and the next's */
const STAGGER = 2;

/**
 * A departures board: one row per feature, its status in split-flap cells. The first time the
 * board comes on screen every cell runs up the alphabet to its letter, row after row, a cell a
 * tick behind its left neighbour. The server renders the board at rest, and so does reduced
 * motion.
 */
export function Board({ rows }: { rows: Row[] }) {
  const [tick, setTick] = useState(Number.POSITIVE_INFINITY);
  const ref = useCallback(
    (el: HTMLUListElement | null) => {
      if (!el || reduced()) return;
      const last = (rows.length - 1) * STAGGER + WIDTH + ALPHA.length;
      let timer = 0;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io.disconnect();
          let t = 0;
          setTick(0);
          timer = window.setInterval(() => {
            t++;
            setTick(t >= last ? Number.POSITIVE_INFINITY : t);
            if (t >= last) clearInterval(timer);
          }, FLIP);
        },
        { threshold: 0.4 },
      );
      io.observe(el);
      return () => {
        io.disconnect();
        clearInterval(timer);
      };
    },
    [rows.length],
  );

  return (
    <ul ref={ref} className="ph-board-rows">
      {rows.map((r, i) => (
        <li key={r.item} data-state={r.state}>
          <span>{r.item}</span>
          <span className="sr-only">: {r.title}</span>
          <Flaps word={r.word} tick={tick - i * STAGGER} />
        </li>
      ))}
    </ul>
  );
}

/** A word in flap cells; each cell shows how far it has got up the alphabet by `tick` */
function Flaps({ word, tick }: { word: string; tick: number }) {
  const cells = word.padEnd(WIDTH, " ");
  return (
    <span aria-hidden className="ph-flaps">
      {[...cells].map((target, c) => {
        const to = ALPHA.indexOf(target);
        const char = ALPHA[Math.min(to, Math.max(0, tick - c))];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-width word's cells
          <span key={c} className="ph-flap" data-blank={target === " " ? "" : undefined}>
            <span key={char}>{char}</span>
          </span>
        );
      })}
    </span>
  );
}
