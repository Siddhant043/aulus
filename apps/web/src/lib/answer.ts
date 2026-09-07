import type { CitationRef } from "@aulus/types";

export type AnswerSegment =
  | { type: "text"; text: string }
  | { type: "cite"; index: number; citation: CitationRef };

export type MarkdownSegment =
  | { type: "text"; text: string }
  | { type: "link"; label: string; href: string };

const CHUNK_MARKER = /\[\[chunk:([0-9a-f-]{36})\]\]/gi;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Deep-link to the exact video + timestamp a Citation came from. */
export function citationHref(citation: CitationRef): string {
  return `https://youtu.be/${citation.youtubeVideoId}?t=${Math.floor(
    citation.citeStartSec,
  )}`;
}

/** Seconds → m:ss (used on citation chips and their hover detail). */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Splits raw answer text (carrying `[[chunk:<id>]]` markers) into renderable
 * segments, mapping each marker to its resolved Citation as a numbered chip.
 * Markers without a matching Citation are dropped — so the answer streams
 * cleanly before the final `citations` event resolves them.
 */
export function parseAnswerSegments(
  raw: string,
  citations: readonly CitationRef[],
): AnswerSegment[] {
  const byChunkId = new Map(
    citations
      .filter((c) => c.chunkId)
      .map((c) => [c.chunkId as string, c]),
  );
  const numberByChunkId = new Map<string, number>();

  const segments: AnswerSegment[] = [];
  let lastIndex = 0;
  for (const match of raw.matchAll(CHUNK_MARKER)) {
    const [marker, chunkId] = match;
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: "text", text: raw.slice(lastIndex, start) });
    }
    lastIndex = start + marker.length;

    const citation = byChunkId.get(chunkId!);
    if (!citation) {
      continue;
    }
    let index = numberByChunkId.get(chunkId!);
    if (index === undefined) {
      index = numberByChunkId.size + 1;
      numberByChunkId.set(chunkId!, index);
    }
    segments.push({ type: "cite", index, citation });
  }
  if (lastIndex < raw.length) {
    segments.push({ type: "text", text: raw.slice(lastIndex) });
  }
  return segments;
}

/**
 * Splits persisted assistant display-markdown into text and inline links. The
 * server resolves Chunk-id markers to `[label](youtu.be/?t=)` before storing,
 * so a reopened Chat renders those as clickable citation chips.
 */
export function parseMarkdownLinks(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole, label, href] = match;
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    segments.push({ type: "link", label: label!, href: href! });
    lastIndex = start + whole.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
}
