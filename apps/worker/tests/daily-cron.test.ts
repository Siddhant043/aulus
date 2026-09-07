import { describe, expect, test } from "bun:test";
import { msUntilNextUtcHour } from "../src/sync/daily-cron";

describe("msUntilNextUtcHour", () => {
  test("targets the same day when the hour is still ahead", () => {
    const now = new Date("2026-09-07T01:30:00Z");
    // 03:00 is 90 minutes away.
    expect(msUntilNextUtcHour(now, 3)).toBe(90 * 60 * 1000);
  });

  test("rolls to tomorrow when the hour has passed", () => {
    const now = new Date("2026-09-07T05:00:00Z");
    // Next 03:00 UTC is 22 hours away.
    expect(msUntilNextUtcHour(now, 3)).toBe(22 * 60 * 60 * 1000);
  });
});
