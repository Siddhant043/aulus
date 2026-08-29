import type { SourceVideoMembership } from "./video-ids-for-scope";

/**
 * After hard-deleting a Source and its membership rows, returns Video ids that
 * no other Source still references — candidates for reachability GC.
 */
export function orphanVideoIdsAfterSourceRemoved(
  membershipBeforeDelete: readonly SourceVideoMembership[],
  removedSourceId: string,
): Set<string> {
  const remaining = membershipBeforeDelete.filter(
    (row) => row.sourceId !== removedSourceId,
  );
  const stillReachable = new Set(remaining.map((row) => row.videoId));
  const removedSourceVideoIds = membershipBeforeDelete
    .filter((row) => row.sourceId === removedSourceId)
    .map((row) => row.videoId);

  return new Set(
    removedSourceVideoIds.filter((videoId) => !stillReachable.has(videoId)),
  );
}
