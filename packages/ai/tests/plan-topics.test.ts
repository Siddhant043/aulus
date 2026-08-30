import { describe, expect, test } from "bun:test";
import { parsePlanTopics } from "../src/skill/plan-topics";

describe("parsePlanTopics", () => {
  test("returns at most 5 topics from a plan JSON payload", () => {
    const topics = parsePlanTopics(
      JSON.stringify({
        topics: [
          "ownership",
          "borrowing",
          "lifetimes",
          "traits",
          "async",
          "macros",
        ],
      }),
    );
    expect(topics).toEqual([
      "ownership",
      "borrowing",
      "lifetimes",
      "traits",
      "async",
    ]);
  });

  test("falls back to a general digest topic when the plan is empty", () => {
    expect(parsePlanTopics('{"topics":[]}')).toEqual([
      "General skill-oriented digest",
    ]);
    expect(parsePlanTopics("not-json")).toEqual([
      "General skill-oriented digest",
    ]);
  });
});
