import type { EnumerateCollection, EnumeratedVideo } from "./ingest-source";

const YOUTUBE_DATA_API = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;

export type YoutubeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type YoutubeDataApiEnumeratorOptions = {
  apiKey: string;
  fetch?: YoutubeFetch;
};

type PlaylistItem = {
  contentDetails?: { videoId?: string };
  snippet?: { title?: string };
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: PlaylistItem[];
  error?: { message?: string };
};

type ChannelResponse = {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
  error?: { message?: string };
};

export function createYoutubeDataApiEnumerator(
  options: YoutubeDataApiEnumeratorOptions,
): EnumerateCollection {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return async (input) => {
    if (input.kind === "playlist") {
      return listPlaylistVideos(fetchImpl, options.apiKey, input.youtubeId);
    }
    const uploadsPlaylistId = await resolveUploadsPlaylistId(
      fetchImpl,
      options.apiKey,
      input.youtubeId,
    );
    return listPlaylistVideos(fetchImpl, options.apiKey, uploadsPlaylistId);
  };
}

async function resolveUploadsPlaylistId(
  fetchImpl: YoutubeFetch,
  apiKey: string,
  youtubeId: string,
): Promise<string> {
  const url = new URL(`${YOUTUBE_DATA_API}/channels`);
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("key", apiKey);
  applyChannelLookup(url, youtubeId);

  const body = await getJson<ChannelResponse>(fetchImpl, url);
  const uploads = body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new Error(`YouTube channel ${youtubeId} has no uploads playlist`);
  }
  return uploads;
}

function applyChannelLookup(url: URL, youtubeId: string): void {
  if (/^UC[\w-]{22}$/.test(youtubeId)) {
    url.searchParams.set("id", youtubeId);
    return;
  }
  if (youtubeId.startsWith("@") && youtubeId.length > 1) {
    url.searchParams.set("forHandle", youtubeId);
    return;
  }
  if (youtubeId.startsWith("user/")) {
    const username = youtubeId.slice("user/".length);
    if (username.length === 0) {
      throw new Error(
        `Cannot enumerate channel ${youtubeId} via the YouTube Data API (need a UC id, @handle, or user/ name)`,
      );
    }
    url.searchParams.set("forUsername", username);
    return;
  }
  throw new Error(
    `Cannot enumerate channel ${youtubeId} via the YouTube Data API (need a UC id, @handle, or user/ name)`,
  );
}

async function listPlaylistVideos(
  fetchImpl: YoutubeFetch,
  apiKey: string,
  playlistId: string,
): Promise<EnumeratedVideo[]> {
  const videos: EnumeratedVideo[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
    url.searchParams.set("part", "contentDetails,snippet");
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", apiKey);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const body = await getJson<PlaylistItemsResponse>(fetchImpl, url);
    for (const item of body.items ?? []) {
      const youtubeVideoId = item.contentDetails?.videoId;
      if (!youtubeVideoId) {
        continue;
      }
      videos.push({
        youtubeVideoId,
        title: item.snippet?.title ?? null,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return videos;
}

async function getJson<T extends { error?: { message?: string } }>(
  fetchImpl: YoutubeFetch,
  url: URL,
): Promise<T> {
  const response = await fetchImpl(url.toString());
  const body = (await response.json()) as T;
  if (!response.ok || body.error) {
    throw new Error(
      body.error?.message ??
        `YouTube Data API request failed (${response.status})`,
    );
  }
  return body;
}
