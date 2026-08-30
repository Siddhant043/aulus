import { describe, expect, test } from "bun:test";
import type { RetrievedChunk } from "../src/chat-store";
import { expandNeighborChunks } from "../src/domain/expand-neighbor-chunks";

function chunk(
  id: string,
  videoId: string,
  chunkIndex: number,
  chapterTitle: string | null,
): RetrievedChunk {
  return {
    id,
    videoId,
    youtubeVideoId: "yt",
    chunkIndex,
    content: `chunk-${chunkIndex}`,
    citeStartSec: chunkIndex * 10,
    citeEndSec: chunkIndex * 10 + 9,
    chapterTitle,
  };
}

describe("expandNeighborChunks", () => {
  test("includes ±1 neighbors within the same chapter", () => {
    const videoId = "video-1";
    const chunks = [
      chunk("c0", videoId, 0, "Intro"),
      chunk("c1", videoId, 1, "Intro"),
      chunk("c2", videoId, 2, "Intro"),
      chunk("c3", videoId, 3, "Next"),
    ];
    const grouped = new Map([[videoId, chunks]]);
    const expanded = expandNeighborChunks([chunks[1]!], grouped);
    expect(expanded.map((row) => row.id)).toEqual(["c0", "c1", "c2"]);
  });

  test("does not expand across chapter boundaries", () => {
    const videoId = "video-1";
    const chunks = [
      chunk("c0", videoId, 0, "Intro"),
      chunk("c1", videoId, 1, "Next"),
    ];
    const grouped = new Map([[videoId, chunks]]);
    const expanded = expandNeighborChunks([chunks[0]!], grouped);
    expect(expanded.map((row) => row.id)).toEqual(["c0"]);
  });
});
