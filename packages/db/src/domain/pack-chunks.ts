import { getEncoding } from "js-tiktoken";
import type { TranscriptSegment } from "../schema";

export const CHUNKING_VERSION = "r3-v1";

export type ChapterMarker = {
  startSec: number;
  title: string;
};

export type PackOptions = {
  targetTokens: number;
  overlapTokens: number;
  hardMaxTokens: number;
  minTokens: number;
};

export const DEFAULT_PACK_OPTIONS: PackOptions = {
  targetTokens: 512,
  overlapTokens: 64,
  hardMaxTokens: 768,
  minTokens: 128,
};

export type PackedChunk = {
  chunkIndex: number;
  content: string;
  startSec: number;
  endSec: number;
  citeStartSec: number;
  citeEndSec: number;
  chapterTitle: string | null;
  tokenCount: number;
};

type CountedSegment = {
  text: string;
  startMs: number;
  durationMs: number;
  tokenCount: number;
  isPreferredBreak: boolean;
};

const ASR_PAUSE_MS = 700;
const FILLER = /\b(um|uh)\b/gi;
const BRACKET_TAG = /\[[^\]]*\]/g;
const SENTENCE_END = /[.?!]["']?\s*$/;

const cl100k = getEncoding("cl100k_base");

function countTokens(text: string): number {
  return cl100k.encode(text).length;
}

export function normalizeCaptionText(text: string): string {
  return text
    .replace(BRACKET_TAG, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function endMsOf(segment: { startMs: number; durationMs: number }): number {
  if (segment.durationMs > 0) {
    return segment.startMs + segment.durationMs;
  }
  return segment.startMs;
}

function toCounted(segments: readonly TranscriptSegment[]): CountedSegment[] {
  const cleaned: CountedSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const raw = segments[index]!;
    const text = normalizeCaptionText(raw.text);
    if (text.length === 0) {
      continue;
    }
    const next = segments[index + 1];
    const gapMs = next ? next.startMs - endMsOf(raw) : 0;
    cleaned.push({
      text,
      startMs: raw.startMs,
      durationMs: raw.durationMs,
      tokenCount: countTokens(text),
      isPreferredBreak: SENTENCE_END.test(text) || gapMs > ASR_PAUSE_MS,
    });
  }
  return cleaned;
}

function chapterTitleAt(
  startMs: number,
  chapters: readonly ChapterMarker[],
): string | null {
  let title: string | null = null;
  for (const chapter of chapters) {
    if (chapter.startSec * 1000 <= startMs) {
      title = chapter.title;
    } else {
      break;
    }
  }
  return title;
}

function partitionByChapter(
  segments: readonly CountedSegment[],
  chapters: readonly ChapterMarker[],
): Array<{ title: string | null; segments: CountedSegment[] }> {
  if (chapters.length === 0) {
    return [{ title: null, segments: [...segments] }];
  }
  const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec);
  const partitions: Array<{ title: string | null; segments: CountedSegment[] }> =
    [];
  for (const segment of segments) {
    const title = chapterTitleAt(segment.startMs, sorted);
    const last = partitions[partitions.length - 1];
    if (last && last.title === title) {
      last.segments.push(segment);
    } else {
      partitions.push({ title, segments: [segment] });
    }
  }
  return partitions.filter((partition) => partition.segments.length > 0);
}

function tokenSum(segments: readonly CountedSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.tokenCount, 0);
}

function joinContent(segments: readonly CountedSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}

function spansFor(
  window: readonly CountedSegment[],
  core: readonly CountedSegment[],
): Pick<
  PackedChunk,
  | "startSec"
  | "endSec"
  | "citeStartSec"
  | "citeEndSec"
  | "tokenCount"
  | "content"
> {
  const cite = core.length > 0 ? core : window;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const citeFirst = cite[0]!;
  const citeLast = cite[cite.length - 1]!;
  return {
    content: joinContent(window),
    startSec: first.startMs / 1000,
    endSec: endMsOf(last) / 1000,
    citeStartSec: citeFirst.startMs / 1000,
    citeEndSec: endMsOf(citeLast) / 1000,
    tokenCount: tokenSum(window),
  };
}

function trailingOverlap(
  window: readonly CountedSegment[],
  overlapTokens: number,
): CountedSegment[] {
  if (overlapTokens <= 0 || window.length <= 1) {
    return [];
  }
  const overlap: CountedSegment[] = [];
  let tokens = 0;
  for (let index = window.length - 1; index >= 1; index -= 1) {
    const segment = window[index]!;
    if (overlap.length > 0 && tokens + segment.tokenCount > overlapTokens) {
      break;
    }
    overlap.unshift(segment);
    tokens += segment.tokenCount;
    if (tokens >= overlapTokens) {
      break;
    }
  }
  return overlap;
}

function preferredCutIndex(
  buffer: readonly CountedSegment[],
  targetTokens: number,
  hardMaxTokens: number,
): number | undefined {
  const total = tokenSum(buffer);
  if (total < targetTokens) {
    return undefined;
  }
  for (let index = buffer.length - 1; index >= 1; index -= 1) {
    const prefixTokens = tokenSum(buffer.slice(0, index));
    if (prefixTokens < targetTokens * 0.5) {
      break;
    }
    if (buffer[index - 1]!.isPreferredBreak) {
      return index;
    }
  }
  if (total >= hardMaxTokens) {
    return buffer.length;
  }
  return undefined;
}

type OpenChunk = {
  window: CountedSegment[];
  overlapCount: number;
  chapterTitle: string | null;
};

function toPacked(
  chunk: OpenChunk,
): Omit<PackedChunk, "chunkIndex"> {
  const core = chunk.window.slice(chunk.overlapCount);
  return {
    ...spansFor(chunk.window, core),
    chapterTitle: chunk.chapterTitle,
  };
}

function packPartition(
  segments: readonly CountedSegment[],
  chapterTitle: string | null,
  options: PackOptions,
): Array<Omit<PackedChunk, "chunkIndex">> {
  const emitted: OpenChunk[] = [];
  let overlapSeed: CountedSegment[] = [];
  let buffer: CountedSegment[] = [];
  let overlapCount = 0;

  const flush = (window: CountedSegment[], leadingOverlap: number) => {
    if (window.length === 0) {
      return;
    }
    emitted.push({
      window,
      overlapCount: leadingOverlap,
      chapterTitle,
    });
    overlapSeed = trailingOverlap(window, options.overlapTokens);
  };

  const considerFlush = () => {
    const cut = preferredCutIndex(
      buffer,
      options.targetTokens,
      options.hardMaxTokens,
    );
    if (cut === undefined) {
      return;
    }
    const window = buffer.slice(0, cut);
    flush(window, Math.min(overlapCount, window.length));
    buffer = overlapSeed.concat(buffer.slice(cut));
    overlapCount = overlapSeed.length;
  };

  for (const segment of segments) {
    buffer.push(segment);
    considerFlush();
  }

  if (buffer.length > overlapCount) {
    flush(buffer, overlapCount);
  } else if (buffer.length > 0 && emitted.length === 0) {
    flush(buffer, 0);
  }

  const last = emitted[emitted.length - 1];
  const previous = emitted[emitted.length - 2];
  if (
    last &&
    previous &&
    tokenSum(last.window) < options.minTokens
  ) {
    previous.window = previous.window.concat(
      last.window.slice(last.overlapCount),
    );
    emitted.pop();
  }

  return emitted.map(toPacked);
}

/**
 * Greedy caption-segment packer (R3): ~512-token target, ~15% whole-segment
 * overlap, hard chapter boundaries, dual embed vs Citation spans.
 */
export function packChunks(
  segments: readonly TranscriptSegment[],
  chapters: readonly ChapterMarker[] = [],
  options: Partial<PackOptions> = {},
): PackedChunk[] {
  const resolved: PackOptions = { ...DEFAULT_PACK_OPTIONS, ...options };
  const counted = toCounted(segments);
  const packed: PackedChunk[] = [];
  for (const partition of partitionByChapter(counted, chapters)) {
    for (const chunk of packPartition(
      partition.segments,
      partition.title,
      resolved,
    )) {
      packed.push({ ...chunk, chunkIndex: packed.length });
    }
  }
  return packed;
}
