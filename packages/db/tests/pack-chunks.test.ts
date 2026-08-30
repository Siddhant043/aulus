import { describe, expect, test } from "bun:test";
import { packChunks } from "../src/domain/pack-chunks";
import type { TranscriptSegment } from "../src/schema";

function segment(
  text: string,
  startMs: number,
  durationMs: number,
): TranscriptSegment {
  return { text, startMs, durationMs };
}

const tinyPack = {
  targetTokens: 12,
  overlapTokens: 4,
  hardMaxTokens: 20,
  minTokens: 3,
};

describe("packChunks", () => {
  test("packs segments to the token target with dual embed-vs-cite spans", () => {
    const chunks = packChunks(
      [
        segment("Hello world one.", 0, 1000),
        segment("Hello world two.", 1000, 1000),
        segment("Hello world three.", 2000, 1000),
        segment("Hello world four.", 3000, 1000),
      ],
      [],
      tinyPack,
    );

    expect(chunks.length).toBeGreaterThan(1);
    const second = chunks[1];
    expect(second).toBeDefined();
    expect(second!.citeStartSec).toBeGreaterThan(second!.startSec);
    expect(second!.endSec).toBeGreaterThan(second!.citeStartSec);
    expect(second!.citeEndSec).toBe(second!.endSec);
  });

  test("never lets a chunk cross a chapter boundary", () => {
    const chunks = packChunks(
      [
        segment("Intro sentence one.", 0, 2000),
        segment("Intro sentence two.", 2000, 2000),
        segment("Setup sentence one.", 10_000, 2000),
        segment("Setup sentence two.", 12_000, 2000),
      ],
      [
        { startSec: 0, title: "Intro" },
        { startSec: 10, title: "Setup" },
      ],
      { ...tinyPack, targetTokens: 100 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.chapterTitle).toBe("Intro");
    expect(chunks[0]!.endSec).toBeLessThanOrEqual(10);
    expect(chunks[1]!.chapterTitle).toBe("Setup");
    expect(chunks[1]!.startSec).toBeGreaterThanOrEqual(10);
  });

  test("skips segments that become empty after light cleaning", () => {
    const chunks = packChunks(
      [
        segment("[music]", 0, 5000),
        segment("Hello world.", 5000, 1000),
      ],
      [],
      tinyPack,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe("Hello world.");
    expect(chunks[0]!.startSec).toBe(5);
  });

  test("merges an undersized trailing chunk without duplicating overlap text", () => {
    const chunks = packChunks(
      [
        segment("Hello world one.", 0, 1000),
        segment("Hello world two.", 1000, 1000),
        segment("Hi.", 2000, 1000),
      ],
      [],
      { targetTokens: 8, overlapTokens: 4, hardMaxTokens: 20, minTokens: 50 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe(
      "Hello world one. Hello world two. Hi.",
    );
  });
});
