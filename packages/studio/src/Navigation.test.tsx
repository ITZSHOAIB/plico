// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { click, openRun, stubApi } from "./testing/fixtures";

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("run navigation", () => {
  it("enables artifacts only while a run is selected", async () => {
    stubApi();
    render(<App />);
    expect(await screen.findByRole("region", { name: "Project overview" })).toBeTruthy();
    const artifacts = screen.getByRole("button", { name: "Artifacts" });
    expect((artifacts as HTMLButtonElement).disabled).toBe(true);
    await openRun();
    expect(screen.queryByRole("region", { name: "Project overview" })).toBeNull();
    expect(screen.getByText(/Status: waiting/)).toBeTruthy();
    expect((artifacts as HTMLButtonElement).disabled).toBe(false);
    click("Overview");
    expect(screen.getByRole("region", { name: "Project overview" })).toBeTruthy();
    expect(screen.queryByText(/Status: waiting/)).toBeNull();
    expect((artifacts as HTMLButtonElement).disabled).toBe(true);
  });
});
