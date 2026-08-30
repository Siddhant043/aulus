import { describe, expect, test } from "bun:test";
import { buildEmbedPrefix } from "../src/domain/build-embed-prefix";

describe("buildEmbedPrefix", () => {
  test("joins title, chapter, and body with middle dots", () => {
    expect(
      buildEmbedPrefix({
        videoTitle: "Rust ownership",
        chapterTitle: "Borrow checker",
        body: "The borrow checker tracks references.",
      }),
    ).toBe(
      "Rust ownership · Borrow checker · The borrow checker tracks references.",
    );
  });

  test("omits chapter when the video has none", () => {
    expect(
      buildEmbedPrefix({
        videoTitle: "Rust ownership",
        chapterTitle: null,
        body: "The borrow checker tracks references.",
      }),
    ).toBe("Rust ownership · The borrow checker tracks references.");
  });
});
