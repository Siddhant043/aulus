import { describe, expect, test } from "bun:test";
import type { Source } from "@aulus/types";
import { sourceStatusLabel } from "../src/lib/status";

function progress(p: Partial<Source["progress"]>): Source["progress"] {
  return { discovered: 0, ready: 0, unavailable: 0, error: 0, ...p };
}

describe("sourceStatusLabel", () => {
  test("ready Source reads Ready with its Video count", () => {
    const result = sourceStatusLabel({
      status: "ready",
      progress: progress({ ready: 3 }),
    });
    expect(result.tone).toBe("ready");
    expect(result.label).toBe("Ready · 3");
  });

  test("ingesting Source reads Ingesting ready/total", () => {
    const result = sourceStatusLabel({
      status: "ingesting",
      progress: progress({ discovered: 5, ready: 3 }),
    });
    expect(result.tone).toBe("ingesting");
    // 3 of 8 Videos ready.
    expect(result.label).toBe("Ingesting 3/8");
  });

  test("ingesting with no discovered Videos yet reads a bare Ingesting", () => {
    const result = sourceStatusLabel({
      status: "ingesting",
      progress: progress({}),
    });
    expect(result.tone).toBe("ingesting");
    expect(result.label).toBe("Ingesting…");
  });

  test("unavailable Source reads Unavailable", () => {
    const result = sourceStatusLabel({
      status: "unavailable",
      progress: progress({ unavailable: 2 }),
    });
    expect(result.tone).toBe("unavailable");
    expect(result.label).toBe("Unavailable");
  });

  test("error Source reads Error", () => {
    const result = sourceStatusLabel({
      status: "error",
      progress: progress({ error: 1, ready: 1 }),
    });
    expect(result.tone).toBe("error");
    expect(result.label).toBe("Error");
  });
});
