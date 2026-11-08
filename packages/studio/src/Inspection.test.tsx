// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { required } from "./testing/fakeEventSource";
import { click, stubApi } from "./testing/fixtures";

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

function stubHealth(body: unknown) {
  const fetchMock = stubApi();
  const original = required(fetchMock.getMockImplementation());
  fetchMock.mockImplementation(async (input, init) =>
    input === "/health" ? new Response(JSON.stringify(body)) : original(input, init),
  );
}

describe("inspection mode", () => {
  it("explains why chat and evals are disabled", async () => {
    stubHealth({ ok: true, inspection: true });
    render(<App />);

    expect(await screen.findByText(/another process owns/)).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Chat" }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    click("Evals");
    const run = await screen.findByRole("button", { name: "Run evals" });
    expect((run as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves everything enabled on a normal server", async () => {
    stubHealth({ ok: true });
    render(<App />);

    expect(await screen.findByRole("region", { name: "Project overview" })).toBeTruthy();
    expect(screen.queryByText(/another process owns/)).toBeNull();
    expect((screen.getByRole("button", { name: "Chat" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
