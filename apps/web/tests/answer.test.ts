import { describe, expect, test } from "bun:test";
import type { CitationRef } from "@aulus/types";
import {
  citationHref,
  formatTimestamp,
  parseAnswerSegments,
  parseMarkdownLinks,
} from "../src/lib/answer";

const cite = (over: Partial<CitationRef>): CitationRef => ({
  videoId: "v1",
  youtubeVideoId: "abc123",
  citeStartSec: 12,
  citeEndSec: 48,
  chunkId: "11111111-1111-4111-8111-111111111111",
  ...over,
});

describe("formatTimestamp", () => {
  test("formats seconds as m:ss", () => {
    expect(formatTimestamp(12)).toBe("0:12");
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(3661)).toBe("61:01");
  });
});

describe("citationHref", () => {
  test("deep-links to youtu.be with a floored ?t=", () => {
    expect(citationHref(cite({ youtubeVideoId: "xyz", citeStartSec: 42.7 }))).toBe(
      "https://youtu.be/xyz?t=42",
    );
  });
});

describe("parseAnswerSegments", () => {
  test("replaces a known chunk marker with a numbered cite segment", () => {
    const c = cite({ chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const segments = parseAnswerSegments(
      `Ownership is enforced [[chunk:${c.chunkId}]] at compile time.`,
      [c],
    );
    expect(segments).toEqual([
      { type: "text", text: "Ownership is enforced " },
      { type: "cite", index: 1, citation: c },
      { type: "text", text: " at compile time." },
    ]);
  });

  test("reuses the same number for a repeated chunk and increments for a new one", () => {
    const a = cite({ chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const b = cite({ chunkId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const segments = parseAnswerSegments(
      `x [[chunk:${a.chunkId}]] y [[chunk:${b.chunkId}]] z [[chunk:${a.chunkId}]]`,
      [a, b],
    );
    const indices = segments
      .filter((s) => s.type === "cite")
      .map((s) => (s.type === "cite" ? s.index : 0));
    expect(indices).toEqual([1, 2, 1]);
  });

  test("drops markers with no matching citation (e.g. mid-stream, before citations arrive)", () => {
    const segments = parseAnswerSegments(
      "streaming text [[chunk:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] more",
      [],
    );
    expect(segments).toEqual([
      { type: "text", text: "streaming text " },
      { type: "text", text: " more" },
    ]);
  });
});

describe("parseMarkdownLinks", () => {
  test("splits inline [label](url) links out of persisted display markdown", () => {
    const segments = parseMarkdownLinks(
      "Ownership is enforced [Ownership](https://youtu.be/abc?t=12) here.",
    );
    expect(segments).toEqual([
      { type: "text", text: "Ownership is enforced " },
      { type: "link", label: "Ownership", href: "https://youtu.be/abc?t=12" },
      { type: "text", text: " here." },
    ]);
  });

  test("plain text with no links is a single text segment", () => {
    expect(parseMarkdownLinks("just words")).toEqual([
      { type: "text", text: "just words" },
    ]);
  });
});
