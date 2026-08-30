import { describe, expect, test } from "bun:test";
import type { RetrievedChunk } from "../src/chat-store";
import {
  extractChunkIdsFromAnswer,
  resolveCitations,
  youtubeDeepLink,
} from "../src/domain/citation-resolver";

const chunkA: RetrievedChunk = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  videoId: "11111111-1111-1111-1111-111111111111",
  youtubeVideoId: "abc123",
  chunkIndex: 0,
  content: "Rust ownership basics",
  citeStartSec: 42.5,
  citeEndSec: 90,
  chapterTitle: "Ownership",
};

describe("resolveCitations", () => {
  test("maps chunk markers to youtube deep-links and structured citations", () => {
    const allowed = new Set([chunkA.id]);
    const byId = new Map([[chunkA.id, chunkA]]);
    const raw =
      "See [[chunk:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] for details.";

    const result = resolveCitations(raw, allowed, byId);

    expect(result.displayMarkdown).toBe(
      `See [Ownership](${youtubeDeepLink("abc123", 42.5)}) for details.`,
    );
    expect(result.citations).toEqual([
      {
        videoId: chunkA.videoId,
        youtubeVideoId: "abc123",
        citeStartSec: 42.5,
        citeEndSec: 90,
        chunkId: chunkA.id,
      },
    ]);
  });

  test("drops chunk ids outside the retrieved set", () => {
    const unknownId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const result = resolveCitations(
      `Missing [[chunk:${unknownId}]]`,
      new Set([chunkA.id]),
      new Map([[chunkA.id, chunkA]]),
    );
    expect(result.displayMarkdown).toBe("Missing");
    expect(result.citations).toEqual([]);
  });

  test("extractChunkIdsFromAnswer returns all marker ids", () => {
    const ids = extractChunkIdsFromAnswer(
      "A [[chunk:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]] and [[chunk:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]]",
    );
    expect(ids).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
  });
});
