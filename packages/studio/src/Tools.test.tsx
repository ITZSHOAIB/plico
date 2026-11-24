// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { stubApi } from "./testing/fixtures";

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

it("shows declared and MCP tools with their effective approval policy", async () => {
  stubApi();
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
  const tools = await screen.findByRole("region", { name: "Tools" });

  expect(within(tools).getByText("create_ticket")).toBeTruthy();
  expect(within(tools).getByText("tools/create-ticket.tool.ts")).toBeTruthy();
  expect(within(tools).getByText(/Writes to the ticketing system/)).toBeTruthy();
  expect(within(tools).getByText("mcp_tickets__get_ticket")).toBeTruthy();
  expect(within(tools).getByText("mcp:tickets/get_ticket")).toBeTruthy();
  expect(within(tools).getAllByText("Requires approval")).toHaveLength(1);
  expect(within(tools).getByText("No approval required")).toBeTruthy();
});
