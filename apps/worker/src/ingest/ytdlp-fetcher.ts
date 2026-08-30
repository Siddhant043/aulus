import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptSegment } from "@aulus/db";
import type { ChapterMarker } from "@aulus/db";
import type {
  TranscriptFetchResult,
  VideoMetadata,
} from "./transcript-fetcher";

export type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SpawnFn = (command: string[], cwd: string) => Promise<SpawnResult>;

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
};

type YtdlpDump = {
  title?: string;
  description?: string;
  duration?: number;
  channel_id?: string;
  chapters?: Array<{ start_time?: number; title?: string }>;
  thumbnails?: Array<{ url?: string }>;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
};

export function parseJson3Events(raw: unknown): TranscriptSegment[] {
  const events = (raw as { events?: Json3Event[] }).events ?? [];
  const segments: TranscriptSegment[] = [];
  for (const event of events) {
    const text = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (text.length === 0) {
      continue;
    }
    segments.push({
      text,
      startMs: event.tStartMs ?? 0,
      durationMs: event.dDurationMs ?? 0,
    });
  }
  return segments;
}

function metadataFromDump(dump: YtdlpDump): VideoMetadata {
  const chapters: ChapterMarker[] = (dump.chapters ?? [])
    .filter((chapter) => typeof chapter.start_time === "number" && chapter.title)
    .map((chapter) => ({
      startSec: chapter.start_time!,
      title: chapter.title!,
    }));
  const thumbnails: Record<string, string> = {};
  const lastThumb = dump.thumbnails?.at(-1)?.url;
  if (lastThumb) {
    thumbnails.default = lastThumb;
  }
  return {
    title: dump.title ?? "Untitled",
    description: dump.description ?? null,
    durationSec: dump.duration ?? null,
    chapters,
    thumbnails,
    channelYoutubeId: dump.channel_id ?? null,
  };
}

export async function defaultSpawn(
  command: string[],
  cwd: string,
): Promise<SpawnResult> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export async function fetchTranscriptWithYtdlp(
  youtubeVideoId: string,
  spawn: SpawnFn = defaultSpawn,
  binary = process.env.YT_DLP_PATH ?? "yt-dlp",
): Promise<TranscriptFetchResult> {
  const workdir = await mkdtemp(join(tmpdir(), "aulus-ytdlp-"));
  try {
    const url = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
    const spawned = await spawn(
      [
        binary,
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-format",
        "json3",
        "--sub-langs",
        "en.*,en",
        "--no-playlist",
        "--no-simulate",
        "-o",
        "%(id)s",
        "-J",
        url,
      ],
      workdir,
    );

    if (spawned.exitCode !== 0) {
      const combined = `${spawned.stderr}\n${spawned.stdout}`;
      if (/subtitles? are not available|no subtitle/i.test(combined)) {
        return { ok: false, reason: "no_captions", message: spawned.stderr.trim() };
      }
      return {
        ok: false,
        reason: "error",
        message: spawned.stderr.trim() || `yt-dlp exited ${spawned.exitCode}`,
      };
    }

    let dump: YtdlpDump = {};
    try {
      dump = JSON.parse(spawned.stdout) as YtdlpDump;
    } catch {
      dump = {};
    }
    const metadata = metadataFromDump(dump);

    const files = (await readdir(workdir)).filter((name) =>
      name.endsWith(".json3"),
    );
    if (files.length === 0) {
      return { ok: false, reason: "no_captions", message: "No json3 captions", metadata };
    }

    const preferred =
      files.find((name) => name.includes(".en.")) ?? files[0]!;
    const parsed = parseJson3Events(
      JSON.parse(await readFile(join(workdir, preferred), "utf8")),
    );
    if (parsed.length === 0) {
      return { ok: false, reason: "no_captions", message: "Empty captions", metadata };
    }

    const hasManual = dump.subtitles && Object.keys(dump.subtitles).length > 0;
    return {
      ok: true,
      segments: parsed,
      isAsr: !hasManual,
      language: "en",
      metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
