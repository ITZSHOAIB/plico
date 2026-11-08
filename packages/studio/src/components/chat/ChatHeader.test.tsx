// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatHeader } from "./ChatHeader";

afterEach(cleanup);

function header(onRename: (title: string) => Promise<void>) {
  return (
    <ChatHeader
      title="VPN token · Berlin office"
      subtitle="Started Nov 8"
      run={null}
      inspectorCollapsed={false}
      onExpandInspector={() => undefined}
      onOpenInspector={() => undefined}
      onRename={onRename}
    />
  );
}

it("renames the conversation inline and saves on Enter", async () => {
  const onRename = vi.fn(async () => undefined);
  render(header(onRename));

  fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
  const input = screen.getByRole("textbox", { name: "Conversation title" });
  expect((input as HTMLInputElement).value).toBe("VPN token · Berlin office");
  fireEvent.change(input, { target: { value: "  Berlin VPN  " } });
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() => expect(onRename).toHaveBeenCalledWith("Berlin VPN"));
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
});

it("cancels with Escape and does not call rename", () => {
  const onRename = vi.fn(async () => undefined);
  render(header(onRename));

  fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
  const input = screen.getByRole("textbox", { name: "Conversation title" });
  fireEvent.change(input, { target: { value: "Something else" } });
  fireEvent.keyDown(input, { key: "Escape" });

  expect(onRename).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("heading", { name: "VPN token · Berlin office" })).toBeTruthy();
});

it("keeps the editor open and says why when saving fails", async () => {
  render(header(async () => Promise.reject(new Error("Title is too long."))));

  fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
  const input = screen.getByRole("textbox", { name: "Conversation title" });
  fireEvent.change(input, { target: { value: "A new name" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect((await screen.findByRole("alert")).textContent).toContain("Title is too long.");
  expect(screen.getByRole("textbox", { name: "Conversation title" })).toBeTruthy();
});

it("does not offer renaming when the host gives no handler", () => {
  render(
    <ChatHeader
      title="Chat"
      subtitle="Try your agent"
      run={null}
      inspectorCollapsed={false}
      onExpandInspector={() => undefined}
      onOpenInspector={() => undefined}
    />,
  );

  expect(screen.queryByRole("button", { name: "Rename conversation" })).toBeNull();
});
