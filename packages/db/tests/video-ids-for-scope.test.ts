import { describe, expect, test } from "bun:test";
import { videoIdsForScope } from "../src/domain/video-ids-for-scope";

describe("videoIdsForScope", () => {
  const sourceVideos = [
    { sourceId: "src-channel", videoId: "vid-a" },
    { sourceId: "src-channel", videoId: "vid-b" },
    { sourceId: "src-playlist", videoId: "vid-b" },
    { sourceId: "src-playlist", videoId: "vid-c" },
    { sourceId: "src-video", videoId: "vid-d" },
  ];

  const collectionSources = [
    { collectionId: "col-rust", sourceId: "src-channel" },
    { collectionId: "col-rust", sourceId: "src-video" },
  ];

  test("library scope returns every distinct video across all sources", () => {
    const ids = videoIdsForScope(
      { kind: "library" },
      { sourceVideos, collectionSources },
    );
    expect([...ids].sort()).toEqual(["vid-a", "vid-b", "vid-c", "vid-d"]);
  });

  test("source scope returns videos membership for that source only", () => {
    const ids = videoIdsForScope(
      { kind: "source", sourceId: "src-playlist" },
      { sourceVideos, collectionSources },
    );
    expect([...ids].sort()).toEqual(["vid-b", "vid-c"]);
  });

  test("collection scope unions videos reachable from member sources", () => {
    const ids = videoIdsForScope(
      { kind: "collection", collectionId: "col-rust" },
      { sourceVideos, collectionSources },
    );
    expect([...ids].sort()).toEqual(["vid-a", "vid-b", "vid-d"]);
  });
});
