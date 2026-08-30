export type ParsedYoutubeUrl = {
  kind: "video" | "channel" | "playlist";
  youtubeId: string;
  canonicalUrl: string;
};

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]+$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "music.youtube.com",
]);

export class YoutubeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeUrlError";
  }
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").replace(/^m\./, "");
}

function isYoutubeHost(host: string): boolean {
  return YOUTUBE_HOSTS.has(host);
}

function parseVideoId(value: string | null): string | undefined {
  if (!value || !VIDEO_ID.test(value)) {
    return undefined;
  }
  return value;
}

export function parseYoutubeUrl(raw: string): ParsedYoutubeUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new YoutubeUrlError("Not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new YoutubeUrlError("YouTube URL must be http(s)");
  }

  const host = hostnameOf(url);
  if (!isYoutubeHost(host)) {
    throw new YoutubeUrlError("URL is not a YouTube link");
  }

  if (host === "youtu.be") {
    const videoId = parseVideoId(url.pathname.slice(1).split("/")[0] ?? "");
    if (!videoId) {
      throw new YoutubeUrlError("Could not find a video id in this URL");
    }
    return {
      kind: "video",
      youtubeId: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const watchVideoId = parseVideoId(url.searchParams.get("v"));
  if (watchVideoId) {
    return {
      kind: "video",
      youtubeId: watchVideoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${watchVideoId}`,
    };
  }

  if (
    segments[0] === "shorts" ||
    segments[0] === "embed" ||
    segments[0] === "live"
  ) {
    const videoId = parseVideoId(segments[1] ?? "");
    if (!videoId) {
      throw new YoutubeUrlError("Could not find a video id in this URL");
    }
    return {
      kind: "video",
      youtubeId: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const playlistId = url.searchParams.get("list");
  if (
    (segments[0] === "playlist" || url.searchParams.has("list")) &&
    playlistId &&
    PLAYLIST_ID.test(playlistId)
  ) {
    return {
      kind: "playlist",
      youtubeId: playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    };
  }

  if (segments[0] === "channel" && segments[1] && CHANNEL_ID.test(segments[1])) {
    return {
      kind: "channel",
      youtubeId: segments[1],
      canonicalUrl: `https://www.youtube.com/channel/${segments[1]}`,
    };
  }

  if (segments[0]?.startsWith("@") && segments[0].length > 1) {
    const handle = segments[0];
    return {
      kind: "channel",
      youtubeId: handle,
      canonicalUrl: `https://www.youtube.com/${handle}`,
    };
  }

  if (
    (segments[0] === "c" || segments[0] === "user") &&
    segments[1]
  ) {
    const slug = `${segments[0]}/${segments[1]}`;
    return {
      kind: "channel",
      youtubeId: slug,
      canonicalUrl: `https://www.youtube.com/${slug}`,
    };
  }

  throw new YoutubeUrlError(
    "Could not detect a video, channel, or playlist in this URL",
  );
}