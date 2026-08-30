import type {
  TranscriptFetchResult,
  TranscriptFetcher,
  VideoMetadata,
} from "./transcript-fetcher";

function mergeMetadata(
  primary: Partial<VideoMetadata> | undefined,
  fallback: VideoMetadata,
): VideoMetadata {
  if (!primary) {
    return fallback;
  }
  return {
    title: fallback.title,
    description: fallback.description ?? primary.description ?? null,
    durationSec: fallback.durationSec ?? primary.durationSec ?? null,
    chapters:
      fallback.chapters.length > 0
        ? fallback.chapters
        : (primary.chapters ?? []),
    thumbnails:
      Object.keys(fallback.thumbnails).length > 0
        ? fallback.thumbnails
        : (primary.thumbnails ?? {}),
    channelYoutubeId:
      fallback.channelYoutubeId ?? primary.channelYoutubeId ?? null,
  };
}

/**
 * yt-dlp primary, youtubei.js fallback. Prefers `no_captions` over a generic
 * extractor error so the Video can be marked unavailable.
 */
export async function fetchTranscriptWithFallback(
  youtubeVideoId: string,
  primary: TranscriptFetcher,
  fallback: TranscriptFetcher,
): Promise<TranscriptFetchResult> {
  const first = await primary(youtubeVideoId);
  if (first.ok) {
    return first;
  }
  const second = await fallback(youtubeVideoId);
  if (second.ok) {
    return {
      ...second,
      metadata: mergeMetadata(first.metadata, second.metadata),
    };
  }
  if (first.reason === "no_captions" || second.reason === "no_captions") {
    return {
      ok: false,
      reason: "no_captions",
      message: first.reason === "no_captions" ? first.message : second.message,
      metadata: second.metadata ?? first.metadata,
    };
  }
  return second;
}
