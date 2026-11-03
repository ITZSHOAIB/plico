import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const storageKey = "plico-studio-theme";
const listeners = new Set<() => void>();

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Applies the stored (or system) theme. Call once before the first render. */
export function initTheme(): void {
  document.documentElement.dataset.theme = storedTheme() ?? systemTheme();
}

function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
