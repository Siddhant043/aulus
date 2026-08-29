import { describe, expect, test } from "bun:test";
import { nextSkillContentVersion } from "../src/domain/next-skill-content-version";

describe("nextSkillContentVersion", () => {
  test("starts at 1 when no versions exist for the scope", () => {
    expect(nextSkillContentVersion([])).toBe(1);
  });

  test("increments past the highest existing version", () => {
    expect(nextSkillContentVersion([1, 2, 4])).toBe(5);
  });
});
