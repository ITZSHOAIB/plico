// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { click, json, stubApi } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("reports errors loading runs, instructions and evals", async () => {
  const mock = stubApi();
  const original = required(mock.getMockImplementation());
  mock.mockImplementation(async (input, init) =>
    ["/v1/runs", "/v1/instructions", "/v1/eval"].includes(String(input))
      ? json({}, 500)
      : original(input, init),
  );
  render(<App />);
  expect(await screen.findByText("Could not load runs")).toBeTruthy();
  click("Instructions");
  expect(await screen.findByText("Could not load instructions")).toBeTruthy();
  click("Evals");
  expect(await screen.findByText("Could not load eval results")).toBeTruthy();
  expect(screen.queryByText("No eval results yet")).toBeNull();
});
