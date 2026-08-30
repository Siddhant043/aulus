import { describe, expect, test } from "bun:test";
import { createYoutubeDataApiEnumerator } from "../src/ingest/youtube-data-api";

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createYoutubeDataApiEnumerator", () => {
  test("pages a playlist and returns every Video id", async () => {
    const urls: string[] = [];
    const enumerate = createYoutubeDataApiEnumerator({
      apiKey: "test-key",
      fetch: async (input) => {
        const url = String(input);
        urls.push(url);
        const parsed = new URL(url);
        expect(parsed.searchParams.get("key")).toBe("test-key");
        expect(parsed.searchParams.get("playlistId")).toBe("PLtest");
        if (!parsed.searchParams.get("pageToken")) {
          return jsonResponse({
            nextPageToken: "page-2",
            items: [
              { contentDetails: { videoId: "aaaaaaaaaaa" }, snippet: { title: "One" } },
            ],
          });
        }
        expect(parsed.searchParams.get("pageToken")).toBe("page-2");
        return jsonResponse({
          items: [
            { contentDetails: { videoId: "bbbbbbbbbbb" }, snippet: { title: "Two" } },
            { snippet: { title: "Deleted video" } },
          ],
        });
      },
    });

    const videos = await enumerate({ kind: "playlist", youtubeId: "PLtest" });
    expect(videos).toEqual([
      { youtubeVideoId: "aaaaaaaaaaa", title: "One" },
      { youtubeVideoId: "bbbbbbbbbbb", title: "Two" },
    ]);
    expect(urls).toHaveLength(2);
  });

  test("resolves a channel id to its uploads playlist then enumerates Videos", async () => {
    const enumerate = createYoutubeDataApiEnumerator({
      apiKey: "test-key",
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/channels")) {
          expect(url.searchParams.get("id")).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
          return jsonResponse({
            items: [
              {
                contentDetails: {
                  relatedPlaylists: { uploads: "UU_x5XG1OV2P6uZZ5FSM9Ttw" },
                },
              },
            ],
          });
        }
        expect(url.searchParams.get("playlistId")).toBe(
          "UU_x5XG1OV2P6uZZ5FSM9Ttw",
        );
        return jsonResponse({
          items: [
            {
              contentDetails: { videoId: "ccccccccccc" },
              snippet: { title: "Upload" },
            },
          ],
        });
      },
    });

    await expect(
      enumerate({
        kind: "channel",
        youtubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      }),
    ).resolves.toEqual([{ youtubeVideoId: "ccccccccccc", title: "Upload" }]);
  });

  test("resolves an @handle channel via forHandle", async () => {
    const enumerate = createYoutubeDataApiEnumerator({
      apiKey: "test-key",
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/channels")) {
          expect(url.searchParams.get("forHandle")).toBe("@GoogleDevelopers");
          return jsonResponse({
            items: [
              {
                contentDetails: {
                  relatedPlaylists: { uploads: "UU-uploads-id-000000000" },
                },
              },
            ],
          });
        }
        return jsonResponse({
          items: [
            {
              contentDetails: { videoId: "ddddddddddd" },
              snippet: { title: "Handle upload" },
            },
          ],
        });
      },
    });

    await expect(
      enumerate({ kind: "channel", youtubeId: "@GoogleDevelopers" }),
    ).resolves.toEqual([
      { youtubeVideoId: "ddddddddddd", title: "Handle upload" },
    ]);
  });

  test("rejects a /c/ custom URL that the Data API cannot resolve", async () => {
    const enumerate = createYoutubeDataApiEnumerator({
      apiKey: "test-key",
      fetch: async () => {
        throw new Error("should not call the Data API");
      },
    });

    await expect(
      enumerate({ kind: "channel", youtubeId: "c/GoogleDevelopers" }),
    ).rejects.toThrow(/UC id, @handle, or user\//);
  });
});
