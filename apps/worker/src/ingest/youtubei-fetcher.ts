import { Innertube } from "youtubei.js";
import type { TranscriptSegment } from "@aulus/db";
import type {
  TranscriptFetchResult,
  VideoMetadata,
} from "./transcript-fetcher";

function metadataFromInfo(info: {
  basic_info?: {
    title?: string;
    short_description?: string;
    duration?: number;
    channel?: { id?: string } | null;
    thumbnail?: Array<{ url?: string }>;
  };
}): VideoMetadata {
  const basic = info.basic_info ?? {};
  const thumbnails: Record<string, string> = {};
  const thumb = basic.thumbnail?.[0]?.url;
  if (thumb) {
    thumbnails.default = thumb;
  }
  return {
    title: basic.title ?? "Untitled",
    description: basic.short_description ?? null,
    durationSec: basic.duration ?? null,
    chapters: [],
    thumbnails,
    channelYoutubeId: basic.channel?.id ?? null,
  };
}

function asText(value: { text?: string } | string | undefined): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value.text ?? "";
}

function segmentsFromTranscript(transcript: unknown): TranscriptSegment[] {
  const root = transcript as {
    transcript?: {
      content?: {
        body?: {
          initial_segments?: Array<{
            type?: string;
            start_ms?: string;
            end_ms?: string;
            snippet?: { text?: string };
          }>;
        } | null;
      } | null;
    };
  };
  const initial = root.transcript?.content?.body?.initial_segments ?? [];
  const segments: TranscriptSegment[] = [];
  for (const item of initial) {
    if (item.type === "TranscriptSectionHeader") {
      continue;
    }
    const trimmed = asText(item.snippet).trim();
    if (!trimmed) {
      continue;
    }
    const startMs = Number(item.start_ms ?? 0);
    const endMs = Number(item.end_ms ?? item.start_ms ?? 0);
    segments.push({
      text: trimmed,
      startMs,
      durationMs: Math.max(0, endMs - startMs),
    });
  }
  return segments;
}

export async function fetchTranscriptWithYoutubei(
  youtubeVideoId: string,
): Promise<TranscriptFetchResult> {
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(youtubeVideoId);
    const metadata = metadataFromInfo(info);
    try {
      const transcript = await info.getTranscript();
      const segments = segmentsFromTranscript(transcript);
      if (segments.length === 0) {
        return {
          ok: false,
          reason: "no_captions",
          message: "youtubei.js returned no caption segments",
          metadata,
        };
      }
      return {
        ok: true,
        segments,
        isAsr: true,
        language: transcript.selectedLanguage ?? "en",
        metadata,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: "no_captions", message, metadata };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  }
}
