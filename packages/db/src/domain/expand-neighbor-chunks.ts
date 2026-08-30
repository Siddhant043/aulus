import type { RetrievedChunk } from "../chat-store";

/**
 * Expands kept Chunks by ±1 neighbor within the same Video, never across chapters.
 */
export function expandNeighborChunks(
  keptChunks: readonly RetrievedChunk[],
  chunksByVideo: ReadonlyMap<string, readonly RetrievedChunk[]>,
): RetrievedChunk[] {
  const expanded = new Map<string, RetrievedChunk>();

  for (const chunk of keptChunks) {
    expanded.set(chunk.id, chunk);
    const siblings = chunksByVideo.get(chunk.videoId) ?? [];
    const index = siblings.findIndex((row) => row.id === chunk.id);
    if (index === -1) {
      continue;
    }

    for (const delta of [-1, 1] as const) {
      const neighbor = siblings[index + delta];
      if (!neighbor) {
        continue;
      }
      if (neighbor.chapterTitle !== chunk.chapterTitle) {
        continue;
      }
      expanded.set(neighbor.id, neighbor);
    }
  }

  return [...expanded.values()].sort((left, right) => {
    if (left.videoId !== right.videoId) {
      return left.videoId.localeCompare(right.videoId);
    }
    return left.chunkIndex - right.chunkIndex;
  });
}

export function groupChunksByVideo(
  chunks: readonly RetrievedChunk[],
): Map<string, RetrievedChunk[]> {
  const grouped = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const existing = grouped.get(chunk.videoId) ?? [];
    existing.push(chunk);
    grouped.set(chunk.videoId, existing);
  }
  for (const [videoId, rows] of grouped) {
    grouped.set(
      videoId,
      [...rows].sort((left, right) => left.chunkIndex - right.chunkIndex),
    );
  }
  return grouped;
}
