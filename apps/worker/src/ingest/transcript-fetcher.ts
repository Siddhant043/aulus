import type { ChapterMarker } from "@aulus/db";
import type { TranscriptSegment } from "@aulus/db";

export type VideoMetadata = {
  title: string;
  description: string | null;
  durationSec: number | null;
  chapters: ChapterMarker[];
  thumbnails: Record<string, string>;
  channelYoutubeId: string | null;
};

export type TranscriptFetchResult =
  | {
      ok: true;
      segments: TranscriptSegment[];
      isAsr: boolean;
      language: string | null;
      metadata: VideoMetadata;
    }
  | {
      ok: false;
      reason: "no_captions" | "error";
      message: string;
      metadata?: Partial<VideoMetadata>;
    };

export type TranscriptFetcher = (
  youtubeVideoId: string,
) => Promise<TranscriptFetchResult>;
