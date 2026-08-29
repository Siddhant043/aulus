export type Scope =
  | { kind: "library" }
  | { kind: "source"; sourceId: string }
  | { kind: "collection"; collectionId: string };

export type SourceVideoMembership = {
  sourceId: string;
  videoId: string;
};

export type CollectionSourceMembership = {
  collectionId: string;
  sourceId: string;
};

export type MembershipSnapshot = {
  sourceVideos: readonly SourceVideoMembership[];
  collectionSources: readonly CollectionSourceMembership[];
};

/**
 * Resolves the distinct Video ids reachable from a Chat / skill-content Scope.
 */
export function videoIdsForScope(
  scope: Scope,
  membership: MembershipSnapshot,
): Set<string> {
  switch (scope.kind) {
    case "library":
      return new Set(membership.sourceVideos.map((row) => row.videoId));
    case "source":
      return new Set(
        membership.sourceVideos
          .filter((row) => row.sourceId === scope.sourceId)
          .map((row) => row.videoId),
      );
    case "collection": {
      const sourceIds = new Set(
        membership.collectionSources
          .filter((row) => row.collectionId === scope.collectionId)
          .map((row) => row.sourceId),
      );
      return new Set(
        membership.sourceVideos
          .filter((row) => sourceIds.has(row.sourceId))
          .map((row) => row.videoId),
      );
    }
  }
}
