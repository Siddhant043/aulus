import { describe, expect, test } from "bun:test";
import { RunnableLambda } from "@langchain/core/runnables";
import {
  isRetryableLlmError,
  withRetryableFallbacks,
} from "../src/retryable-fallback";

describe("retryable LLM fallback", () => {
  test("treats 429, 5xx, and timeouts as retryable", () => {
    expect(
      isRetryableLlmError(Object.assign(new Error("rate limited"), { status: 429 })),
    ).toBe(true);
    expect(
      isRetryableLlmError(Object.assign(new Error("upstream"), { status: 503 })),
    ).toBe(true);
    expect(isRetryableLlmError(new TimeoutError("timed out"))).toBe(true);
  });

  test("does not treat auth failures as retryable", () => {
    expect(
      isRetryableLlmError(Object.assign(new Error("unauthorized"), { status: 401 })),
    ).toBe(false);
  });

  test("falls back only when the primary error is retryable", async () => {
    const fallback = RunnableLambda.from(() => "from-fallback");
    const rateLimited = withRetryableFallbacks(
      RunnableLambda.from(() => {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      }),
      fallback,
    );
    expect(await rateLimited.invoke("q")).toBe("from-fallback");

    const unauthorized = withRetryableFallbacks(
      RunnableLambda.from(() => {
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      }),
      fallback,
    );
    await expect(unauthorized.invoke("q")).rejects.toThrow(/unauthorized/);
  });
});

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
