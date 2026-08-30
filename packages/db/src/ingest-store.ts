import type { IngestProgress, SourceKind } from "@aulus/types";
import type { TranscriptSegment } from "./schema";
import type { ChapterMarker, PackedChunk } from "./domain/pack-chunks";
import type { VideoStatusValue } from "./domain/source-ingestion-status";

export type SourceRecord = {
  id: string;
  kind: SourceKind;
  youtubeId: string;
  url: string;
  title: string | null;
};

export type VideoRecord = {
  id: string;
  youtubeVideoId: string;
  title: string | null;
  description: string | null;
  durationSec: number | null;
  channelYoutubeId: string | null;
  chapters: ChapterMarker[];
  thumbnails: Record<string, string>;
  status: VideoStatusValue;
  lastIngestError: string | null;
  ingestedAt: Date | null;
};

export type JobKind = "ingest_source" | "ingest_video";
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type JobProgress = IngestProgress;

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  sourceId: string | null;
  videoId: string | null;
  progress: JobProgress;
  error: Record<string, unknown> | null;
};

export type StoredChunk = PackedChunk & {
  embedding: number[] | null;
  chunkingVersion: string;
  embeddingModel: string;
};

export type TranscriptRecord = {
  videoId: string;
  language: string | null;
  isAsr: boolean;
  segments: TranscriptSegment[];
  normalizedSegments: TranscriptSegment[];
};

export type IngestStore = {
  createSource(input: {
    kind: SourceKind;
    youtubeId: string;
    url: string;
    title?: string | null;
  }): Promise<SourceRecord>;
  findSourceByKindAndYoutubeId(
    kind: SourceKind,
    youtubeId: string,
  ): Promise<SourceRecord | undefined>;
  getSource(id: string): Promise<SourceRecord | undefined>;

  upsertVideo(input: {
    youtubeVideoId: string;
    title?: string | null;
    description?: string | null;
    durationSec?: number | null;
    channelYoutubeId?: string | null;
    chapters?: ChapterMarker[];
    thumbnails?: Record<string, string>;
    status?: VideoStatusValue;
  }): Promise<VideoRecord>;
  getVideo(id: string): Promise<VideoRecord | undefined>;
  updateVideo(
    id: string,
    patch: Partial<
      Pick<
        VideoRecord,
        | "title"
        | "description"
        | "durationSec"
        | "channelYoutubeId"
        | "chapters"
        | "thumbnails"
        | "status"
        | "lastIngestError"
        | "ingestedAt"
      >
    >,
  ): Promise<VideoRecord>;
  listVideosForSource(sourceId: string): Promise<VideoRecord[]>;
  ensureSourceVideo(sourceId: string, videoId: string): Promise<void>;

  createJob(input: {
    kind: JobKind;
    sourceId?: string | null;
    videoId?: string | null;
    progress?: JobProgress;
  }): Promise<JobRecord>;
  getJob(id: string): Promise<JobRecord | undefined>;
  updateJob(
    id: string,
    patch: Partial<Pick<JobRecord, "status" | "progress" | "error">>,
  ): Promise<JobRecord>;
  findActiveIngestSourceJob(sourceId: string): Promise<JobRecord | undefined>;

  saveTranscript(record: TranscriptRecord): Promise<void>;
  replaceChunks(videoId: string, chunks: StoredChunk[]): Promise<void>;
  listChunks(videoId: string): Promise<StoredChunk[]>;
  getTranscript(videoId: string): Promise<TranscriptRecord | undefined>;
};

export const ZERO_PROGRESS: JobProgress = {
  discovered: 0,
  ready: 0,
  unavailable: 0,
  error: 0,
};
