import type { SourceVideoLink } from "../ingest-store";

export type SourceVideoDiff = {
  /** Upstream YouTube video ids with no membership row yet — ingest these. */
  newYoutubeIds: string[];
  /** videoIds of active links no longer upstream — tombstone these. */
  removedVideoIds: string[];
  /** videoIds of tombstoned links that are upstream again — clear the tombstone. */
  reappearedVideoIds: string[];
};

/**
 * Diffs a Source's current membership against a fresh upstream enumeration.
 * Videos are matched by YouTube video id; Videos/Chunks themselves are shared
 * and never deleted here — removal only tombstones the membership row.
 */
export function diffSourceVideos(
  links: readonly SourceVideoLink[],
  enumeratedYoutubeIds: readonly string[],
): SourceVideoDiff {
  const upstream = new Set(enumeratedYoutubeIds);
  const knownYoutubeIds = new Set(links.map((link) => link.youtubeVideoId));

  const newYoutubeIds: string[] = [];
  for (const youtubeVideoId of enumeratedYoutubeIds) {
    if (!knownYoutubeIds.has(youtubeVideoId)) {
      newYoutubeIds.push(youtubeVideoId);
    }
  }

  const removedVideoIds: string[] = [];
  const reappearedVideoIds: string[] = [];
  for (const link of links) {
    const isUpstream = upstream.has(link.youtubeVideoId);
    const isTombstoned = link.removedFromUpstreamAt !== null;
    if (!isUpstream && !isTombstoned) {
      removedVideoIds.push(link.videoId);
    } else if (isUpstream && isTombstoned) {
      reappearedVideoIds.push(link.videoId);
    }
  }

  return { newYoutubeIds, removedVideoIds, reappearedVideoIds };
}
