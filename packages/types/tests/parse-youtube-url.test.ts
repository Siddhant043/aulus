import { describe, expect, test } from "bun:test";
import { parseYoutubeUrl, YoutubeUrlError } from "../src/index";

describe("parseYoutubeUrl", () => {
  test("detects a watch URL as video-kind", () => {
    expect(
      parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toEqual({
      kind: "video",
      youtubeId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  test("detects a youtu.be short URL as video-kind", () => {
    expect(parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      youtubeId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  test("treats a watch URL that also has a playlist id as video-kind", () => {
    const parsed = parseYoutubeUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest",
    );
    expect(parsed.kind).toBe("video");
    expect(parsed.youtubeId).toBe("dQw4w9WgXcQ");
  });

  test("detects a playlist URL as playlist-kind", () => {
    expect(
      parseYoutubeUrl(
        "https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
      ),
    ).toEqual({
      kind: "playlist",
      youtubeId: "PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
      canonicalUrl:
        "https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
    });
  });

  test("detects a channel URL as channel-kind", () => {
    expect(
      parseYoutubeUrl("https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"),
    ).toEqual({
      kind: "channel",
      youtubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      canonicalUrl:
        "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    });
  });

  test("rejects a non-YouTube URL", () => {
    expect(() => parseYoutubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toThrow(
      YoutubeUrlError,
    );
  });

  test("rejects a malformed string", () => {
    expect(() => parseYoutubeUrl("not a url")).toThrow(YoutubeUrlError);
  });
});
