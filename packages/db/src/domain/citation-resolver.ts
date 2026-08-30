import type { CitationRef } from "../schema";
import type { RetrievedChunk } from "../chat-store";

const CHUNK_MARKER_PATTERN = /\[\[chunk:([0-9a-f-]{36})\]\]/gi;

export function youtubeDeepLink(
  youtubeVideoId: string,
  citeStartSec: number,
): string {
  return `https://youtu.be/${youtubeVideoId}?t=${Math.floor(citeStartSec)}`;
}

export function resolveCitations(
  rawAnswer: string,
  allowedChunkIds: ReadonlySet<string>,
  chunksById: ReadonlyMap<string, RetrievedChunk>,
): { displayMarkdown: string; citations: CitationRef[] } {
  const citations: CitationRef[] = [];
  const seenCitationKeys = new Set<string>();

  const displayMarkdown = rawAnswer.replace(
    CHUNK_MARKER_PATTERN,
    (marker, chunkId: string) => {
      if (!allowedChunkIds.has(chunkId)) {
        return "";
      }
      const chunk = chunksById.get(chunkId);
      if (!chunk) {
        return "";
      }

      const citationKey = `${chunk.videoId}:${chunk.citeStartSec}`;
      if (!seenCitationKeys.has(citationKey)) {
        seenCitationKeys.add(citationKey);
        citations.push({
          videoId: chunk.videoId,
          youtubeVideoId: chunk.youtubeVideoId,
          citeStartSec: chunk.citeStartSec,
          citeEndSec: chunk.citeEndSec,
          chunkId: chunk.id,
        });
      }

      const label = chunk.chapterTitle ?? "clip";
      const url = youtubeDeepLink(chunk.youtubeVideoId, chunk.citeStartSec);
      return `[${label}](${url})`;
    },
  );

  return { displayMarkdown: displayMarkdown.trim(), citations };
}

export function extractChunkIdsFromAnswer(rawAnswer: string): string[] {
  const ids: string[] = [];
  const pattern = new RegExp(CHUNK_MARKER_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawAnswer)) !== null) {
    ids.push(match[1]!);
  }
  return ids;
}
