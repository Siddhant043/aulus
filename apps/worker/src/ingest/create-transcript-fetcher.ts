import { fetchTranscriptWithFallback } from "./transcript-fallback";
import type { TranscriptFetcher } from "./transcript-fetcher";
import { fetchTranscriptWithYoutubei } from "./youtubei-fetcher";
import { fetchTranscriptWithYtdlp } from "./ytdlp-fetcher";

export function createTranscriptFetcher(): TranscriptFetcher {
  return (youtubeVideoId) =>
    fetchTranscriptWithFallback(
      youtubeVideoId,
      fetchTranscriptWithYtdlp,
      fetchTranscriptWithYoutubei,
    );
}
