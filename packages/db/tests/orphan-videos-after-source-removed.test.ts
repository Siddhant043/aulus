import { describe, expect, test } from "bun:test";
import { orphanVideoIdsAfterSourceRemoved } from "../src/domain/orphan-videos-after-source-removed";

describe("orphanVideoIdsAfterSourceRemoved", () => {
  test("returns videos only referenced by the removed source", () => {
    const membership = [
      { sourceId: "playlist", videoId: "shared" },
      { sourceId: "playlist", videoId: "only-playlist" },
      { sourceId: "channel", videoId: "shared" },
      { sourceId: "channel", videoId: "only-channel" },
    ];

    const orphans = orphanVideoIdsAfterSourceRemoved(membership, "playlist");
    expect([...orphans].sort()).toEqual(["only-playlist"]);
  });

  test("returns empty when every video remains reachable", () => {
    const membership = [
      { sourceId: "a", videoId: "v1" },
      { sourceId: "b", videoId: "v1" },
    ];
    expect(orphanVideoIdsAfterSourceRemoved(membership, "a")).toEqual(
      new Set(),
    );
  });
});
