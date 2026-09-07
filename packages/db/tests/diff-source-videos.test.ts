import { describe, expect, test } from "bun:test";
import { diffSourceVideos, type SourceVideoLink } from "@aulus/db";

const link = (over: Partial<SourceVideoLink>): SourceVideoLink => ({
  videoId: "v",
  youtubeVideoId: "yt",
  status: "ready",
  removedFromUpstreamAt: null,
  ...over,
});

describe("diffSourceVideos", () => {
  test("classifies new, removed, reappeared, and unchanged", () => {
    const links: SourceVideoLink[] = [
      link({ videoId: "v1", youtubeVideoId: "kept1" }),
      link({ videoId: "v2", youtubeVideoId: "gone1" }),
      link({
        videoId: "v3",
        youtubeVideoId: "back1",
        removedFromUpstreamAt: new Date("2020-01-01"),
      }),
    ];
    // Upstream now: kept1 (unchanged), back1 (reappeared), fresh1 (new). gone1 dropped.
    const diff = diffSourceVideos(links, ["kept1", "back1", "fresh1"]);

    expect(diff.newYoutubeIds).toEqual(["fresh1"]);
    expect(diff.removedVideoIds).toEqual(["v2"]);
    expect(diff.reappearedVideoIds).toEqual(["v3"]);
  });

  test("a no-op enumeration produces no changes", () => {
    const links: SourceVideoLink[] = [
      link({ videoId: "v1", youtubeVideoId: "a" }),
      link({ videoId: "v2", youtubeVideoId: "b" }),
    ];
    const diff = diffSourceVideos(links, ["a", "b"]);
    expect(diff.newYoutubeIds).toEqual([]);
    expect(diff.removedVideoIds).toEqual([]);
    expect(diff.reappearedVideoIds).toEqual([]);
  });

  test("an already-tombstoned Video still missing upstream is not re-removed", () => {
    const links: SourceVideoLink[] = [
      link({
        videoId: "v1",
        youtubeVideoId: "gone",
        removedFromUpstreamAt: new Date("2020-01-01"),
      }),
    ];
    const diff = diffSourceVideos(links, []);
    expect(diff.removedVideoIds).toEqual([]);
    expect(diff.reappearedVideoIds).toEqual([]);
    expect(diff.newYoutubeIds).toEqual([]);
  });
});
