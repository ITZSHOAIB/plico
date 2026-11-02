import { expectTypeOf, it } from "vitest";
import type { PlicoEvent } from "./events.js";

it("narrows each event payload by its event type", () => {
  const check = (event: PlicoEvent) => {
    if (event.type === "assistant.output") {
      expectTypeOf(event.payload.content).toEqualTypeOf<string>();
      // @ts-expect-error Output events do not have a tool name.
      event.payload.toolName;
    }
    if (event.type === "tool.call") {
      expectTypeOf(event.payload.toolName).toEqualTypeOf<string>();
      // @ts-expect-error Tool call events do not have output content.
      event.payload.content;
    }
  };
  expectTypeOf(check).toBeFunction();
});
