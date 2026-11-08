import { describe, expect, it } from "vitest";
import { suggestThreadTitle } from "./suggest-title.js";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

describe("suggestThreadTitle", () => {
  it.each([
    ["a greeting", [user("Hi"), assistant("Hello! How can I help you today?")]],
    ["thanks only", [user("thanks!"), assistant("You're welcome!")]],
    ["one bare word", [user("expenses"), assistant("What would you like to do with expenses?")]],
    ["no messages", []],
  ])("waits for a topic after %s", (_name, messages) => {
    expect(suggestThreadTitle(messages)).toBeUndefined();
  });

  it("names the topic once the user says it, not the greeting", () => {
    const messages = [
      user("Hi"),
      assistant("Hello! How can I help you today?"),
      user("I need to reset the VPN token for the Berlin office"),
      assistant("Sure. I can reset the VPN token for the Berlin office. Which employee is it for?"),
    ];

    expect(suggestThreadTitle(messages)).toBe("VPN token · Berlin office");
  });

  it("takes title words from the user, never from a long assistant answer", () => {
    const answer = `The laptop refresh covers London. Eligibility: every employee whose laptop is older than three years qualifies. ${"Security: devices are enrolled before handover. ".repeat(10)}`;

    expect(suggestThreadTitle([user("how does the laptop refresh work?"), assistant(answer)])).toBe(
      "Laptop refresh",
    );
  });

  it("follows the ask in a long pasted message, not the first words", () => {
    const email = `Hi team, the Q3 campaign in Germany overran by 12% because of agency fees. The Lisbon office opens in January and facilities need furniture quotes. Recruiting paused all non-engineering hiring. The survey closes on Friday and response rates are low in APAC. The vendor contract with CloudHost renews on 1 December at a 9% increase. Payroll moves to a new provider in February. The security team will run a phishing simulation next month.`;

    const title = suggestThreadTitle([
      user(`${email}\n\nCan you draft a reply about the CloudHost contract renewal?`),
      assistant("Here is a draft reply."),
    ]);

    expect(title).toContain("CloudHost contract renewal");
    expect(title?.toLowerCase()).toContain("draft reply");
    expect(title).not.toMatch(/Lisbon|Germany|survey|Payroll/i);
  });

  it("titles non-English conversations and joins Japanese phrases without spaces", () => {
    expect(
      suggestThreadTitle([
        user("Necesito cambiar la dirección de facturación de nuestra cuenta de empresa"),
        assistant("Claro. Puedo actualizar la dirección de facturación de la cuenta de empresa."),
      ]),
    ).toBe("Dirección · facturación");
    expect(
      suggestThreadTitle([
        user("来週の東京オフィスの会議室を予約してください"),
        assistant("来週の東京オフィスの会議室を予約しました。"),
      ]),
    ).toBe("東京オフィス · 会議室");
  });

  it("stays fast on a very large thread", () => {
    const filler = "The payments gateway outage report covers the TLS certificate. ".repeat(2000);
    const started = performance.now();

    const title = suggestThreadTitle([user(filler), assistant(filler), user(filler)]);

    expect(title).toBeTruthy();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
