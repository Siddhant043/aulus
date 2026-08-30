import { describe, expect, test } from "bun:test";
import { formatHistoryForPrompt } from "../src/chat/types";

describe("formatHistoryForPrompt", () => {
  test("returns a placeholder when there is no prior context", () => {
    expect(formatHistoryForPrompt([])).toBe("(none)");
  });

  test("formats user and assistant turns for prompt injection", () => {
    const formatted = formatHistoryForPrompt([
      { role: "user", content: "What is ownership?" },
      { role: "assistant", content: "Ownership is enforced at compile time." },
    ]);

    expect(formatted).toBe(
      "User: What is ownership?\nAssistant: Ownership is enforced at compile time.",
    );
  });
});
