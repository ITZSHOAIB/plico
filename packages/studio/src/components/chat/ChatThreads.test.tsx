// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ChatThreads } from "./ChatThreads";

afterEach(cleanup);

it("labels a thread by its title and falls back to a short id", () => {
  render(
    <ChatThreads
      threads={[
        { id: "11111111-aaaa", createdAt: "2026-11-08T00:00:00Z" },
        {
          id: "22222222-bbbb",
          createdAt: "2026-11-08T01:00:00Z",
          title: "VPN token · Berlin office",
        },
      ]}
      selected={null}
      onNew={() => undefined}
      onSelect={() => undefined}
    />,
  );

  expect(screen.getByRole("button", { name: /VPN token · Berlin office/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Thread 11111111/ })).toBeTruthy();
});
