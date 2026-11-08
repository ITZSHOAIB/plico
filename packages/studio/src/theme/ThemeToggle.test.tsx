// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { initTheme } from "./theme";

// Node 26 ships its own `localStorage` global, which hides jsdom's; give the tests a plain one.
beforeEach(() => {
  const items = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      clear: () => items.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it("defaults to dark and switches theme, remembering the choice", () => {
  initTheme();
  render(<ThemeToggle />);
  expect(document.documentElement.dataset.theme).toBe("dark");

  fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(window.localStorage.getItem("plico-studio-theme")).toBe("light");
  expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
});

it("restores the stored theme on startup", () => {
  window.localStorage.setItem("plico-studio-theme", "light");
  initTheme();
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("keeps several toggles in sync", () => {
  initTheme();
  render(
    <>
      <ThemeToggle />
      <ThemeToggle />
    </>,
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Switch to light theme" })[0] as HTMLElement,
  );
  expect(screen.getAllByRole("button", { name: "Switch to dark theme" })).toHaveLength(2);
});
