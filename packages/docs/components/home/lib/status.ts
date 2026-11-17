import { useSyncExternalStore } from "react";

/**
 * The status bar's store. The page reads as one run: each figure (section) registers itself, the
 * one crossing the middle of the viewport is active, and its engine reports event lines that the
 * bar prints with a running sequence number, as `plico events` would.
 */

interface FigureEntry {
  el: HTMLElement;
  id: string;
  label: string;
}

let line = "ready";
let seq = 0;
let figures: readonly FigureEntry[] = [];
let active: HTMLElement | null = null;
const crossing = new Set<HTMLElement>();
let middle: IntersectionObserver | undefined;
const listeners = new Set<() => void>();
const none: readonly FigureEntry[] = [];

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function setLine(next: string) {
  if (next === line) return;
  line = next;
  seq++;
  emit();
}

function update() {
  const [figure = null] = crossing;
  if (figure !== active) {
    active = figure;
    setLine(figure?.dataset.status ?? "ready");
  }
  emit();
}

/** `Figure`'s ref callback: listed in the bar's nav and followed while mounted */
export function registerFigure(el: HTMLElement): () => void {
  middle ??= new IntersectionObserver(
    (records) => {
      for (const r of records) {
        if (r.isIntersecting) crossing.add(r.target as HTMLElement);
        else crossing.delete(r.target as HTMLElement);
      }
      update();
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  const entry = { el, id: el.id, label: el.dataset.label ?? el.id };
  figures = [...figures, entry].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  middle.observe(el);
  emit();
  return () => {
    middle?.unobserve(el);
    crossing.delete(el);
    figures = figures.filter((f) => f.el !== el);
    update();
  };
}

/** A passing line, such as a copied command, until the next */
export function setStatus(next: string) {
  setLine(next);
}

/** A figure's own line: kept on it for when the reader comes back, shown now if it is active */
export function report(from: Element, text: string) {
  const figure = from.closest<HTMLElement>("[data-figure]");
  if (!figure || figure.dataset.status === text) return;
  figure.dataset.status = text;
  if (figure === active) setLine(text);
}

export function onStatus(listener: (text: string, seq: number) => void): () => void {
  let last = -1;
  const check = () => {
    if (seq === last) return;
    last = seq;
    listener(line, seq);
  };
  check();
  return subscribe(check);
}

function useStore<T>(snapshot: () => T, server: T): T {
  return useSyncExternalStore(subscribe, snapshot, () => server);
}

export function useFigures(): readonly FigureEntry[] {
  return useStore(() => figures, none);
}

export function useActive(): string | null {
  return useStore(() => active?.id ?? null, null);
}
