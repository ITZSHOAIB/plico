// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { json, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("opens the run named by a shared URL", async () => {
  stubApi();
  window.history.replaceState(null, "", "/?run=run-1234567890ab");
  render(<App />);
  expect(await screen.findByText("tool.call")).toBeTruthy();
  expect(screen.getByText(/Status: waiting/)).toBeTruthy();
});

it("shows an error when a shared run cannot be opened", async () => {
  stubApi();
  window.history.replaceState(null, "", "/?run=missing");
  render(<App />);
  expect(await screen.findByText("Failed to open run missing")).toBeTruthy();
});

it("does not replace a later selection when a URL request finishes late", async () => {
  const mock = stubApi();
  const original = required(mock.getMockImplementation());
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mock.mockImplementation(async (input, init) =>
    input === "/v1/runs/older" ? pending : original(input, init),
  );
  window.history.replaceState(null, "", "/?run=older");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /run-12345678/ }));
  await screen.findByText("tool.call");
  await act(async () => finish(json({ runId: "older", status: "completed" })));
  expect(screen.getByText("tool.call")).toBeTruthy();
  expect(new URL(window.location.href).searchParams.get("run")).toBe("run-1234567890ab");
});
