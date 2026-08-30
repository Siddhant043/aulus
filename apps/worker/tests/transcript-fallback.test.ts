import { describe, expect, test } from "bun:test";
import { fetchTranscriptWithFallback } from "../src/ingest/transcript-fallback";
import type { TranscriptFetchResult } from "../src/ingest/transcript-fetcher";

const captions: TranscriptFetchResult = {
  ok: true,
  segments: [{ text: "hello", startMs: 0, durationMs: 1000 }],
  isAsr: false,
  language: "en",
  metadata: {
    title: "Hello",
    description: null,
    durationSec: 1,
    chapters: [],
    thumbnails: {},
    channelYoutubeId: null,
  },
};

describe("fetchTranscriptWithFallback", () => {
  test("uses youtubei.js when yt-dlp fails", async () => {
    const result = await fetchTranscriptWithFallback(
      "dQw4w9WgXcQ",
      async () => ({ ok: false, reason: "error", message: "yt-dlp missing" }),
      async () => captions,
    );
    expect(result).toEqual(captions);
  });

  test("does not call the fallback when yt-dlp returns captions", async () => {
    let fallbackCalls = 0;
    const result = await fetchTranscriptWithFallback(
      "dQw4w9WgXcQ",
      async () => captions,
      async () => {
        fallbackCalls += 1;
        return { ok: false, reason: "error", message: "unused" };
      },
    );
    expect(result.ok).toBe(true);
    expect(fallbackCalls).toBe(0);
  });

  test("surfaces no_captions when both extractors find none", async () => {
    const result = await fetchTranscriptWithFallback(
      "dQw4w9WgXcQ",
      async () => ({ ok: false, reason: "no_captions", message: "none" }),
      async () => ({ ok: false, reason: "error", message: "blocked" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_captions");
      expect(result.message).toBe("none");
    }
  });

  test("keeps yt-dlp chapters when youtubei.js supplies the captions", async () => {
    const result = await fetchTranscriptWithFallback(
      "dQw4w9WgXcQ",
      async () => ({
        ok: false,
        reason: "error",
        message: "no json3 on disk",
        metadata: {
          title: "From yt-dlp",
          description: null,
          durationSec: 10,
          chapters: [{ startSec: 0, title: "Intro" }],
          thumbnails: {},
          channelYoutubeId: null,
        },
      }),
      async () => captions,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.chapters).toEqual([
        { startSec: 0, title: "Intro" },
      ]);
    }
  });
});
