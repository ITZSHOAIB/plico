// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatFixtures } from "./ChatFixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lets a developer explore conversations, run errors and a simulated reply without a server", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ChatFixtures />);
  expect(screen.getByText("Dev fixtures")).toBeTruthy();
  expect(screen.getByText(/VPN access/)).toBeTruthy();
  expect(screen.getByText("tool.call")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Failed" }));
  expect(screen.getByText(/Connection to the ticket service failed/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Empty" }));
  const composer = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(composer, { target: { value: "Hello, local preview" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(within(screen.getByRole("log")).getByText("Hello, local preview")).toBeTruthy();
  expect(within(screen.getByRole("log")).getByText(/This is a simulated response/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not send on Enter while the run is streaming", () => {
  render(<ChatFixtures />);
  fireEvent.click(screen.getByRole("button", { name: "Streaming" }));
  const composer = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(composer, { target: { value: "Wait until it finishes" } });
  fireEvent.keyDown(composer, { key: "Enter" });
  expect(within(screen.getByRole("log")).queryByText("Wait until it finishes")).toBeNull();
  expect((composer as HTMLTextAreaElement).value).toBe("Wait until it finishes");
});

it("supports keyboard submission without sending on Shift+Enter or IME composition", () => {
  render(<ChatFixtures />);
  fireEvent.click(screen.getByRole("button", { name: "Empty" }));
  const composer = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(composer, { target: { value: "A keyboard message" } });
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
  expect(within(screen.getByRole("log")).queryByText("A keyboard message")).toBeNull();
  fireEvent.keyDown(composer, { key: "Enter" });
  expect(within(screen.getByRole("log")).getByText("A keyboard message")).toBeTruthy();
});
