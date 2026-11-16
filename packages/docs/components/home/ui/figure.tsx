"use client";

import type { ComponentProps, ReactNode } from "react";
import { registerFigure } from "../lib/status";
import { Shadow } from "./window";

/**
 * A sheet of the drawing set: one section with its top seam and a registration mark where the
 * seam meets each frame line. It lists itself in the status bar under `label`; `status` is the
 * event line the bar prints while it is on screen.
 */
export function Figure({
  label,
  status,
  className,
  children,
  ...props
}: ComponentProps<"section"> & { id: string; label: string; status: string }) {
  return (
    <section
      {...props}
      ref={registerFigure}
      data-figure=""
      data-label={label}
      data-status={status}
      className={`ph-figure ${className ?? ""}`}
    >
      <Mark side="left" />
      <Mark side="right" />
      {children}
    </section>
  );
}

function Mark({ side }: { side: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 11 11" className={`ph-mark ph-mark-${side}`}>
      <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" />
    </svg>
  );
}

/**
 * A status plate over a title, in the machine's pixel type: a lamp in a square cell, the event
 * in the next. The page walks through a run: `01 project.loaded`, `02 run.started`, and so on.
 */
export function Plate({ seq, children }: { seq?: number; children: ReactNode }) {
  return (
    <span className="ph-plate">
      <Shadow />
      <span aria-hidden className="ph-plate-lamp">
        <i />
      </span>
      <span className="ph-plate-text">
        {seq !== undefined ? <b>{String(seq).padStart(2, "0")}</b> : null}
        {children}
      </span>
    </span>
  );
}

/** A figure's title: one sentence in the light voice, its key terms in `<em>` */
export function FigureHeader({
  plate,
  children,
  lede,
}: {
  plate?: ReactNode;
  children: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <div className="ph-figure-head">
      {plate}
      <h2>{children}</h2>
      {lede ? <p className="ph-lede">{lede}</p> : null}
    </div>
  );
}
