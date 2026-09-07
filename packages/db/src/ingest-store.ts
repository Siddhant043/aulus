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
  /** Last successful Sync completion (auto or manual). */
  lastSyncedAt: Date | null;
  /** Last manual Sync trigger — rate-limits manual Sync to once per 24h. */
  lastManualSyncAt: Date | null;
};

/** One Source→Video membership row, with its upstream-removal tombstone. */
export type SourceVideoLink = {
  videoId: string;
  youtubeVideoId: string;
  status: VideoStatusValue;
  removedFromUpstreamAt: Date | null;
};

export type CollectionRecord = {
  id: string;
  name: string;
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

export type JobKind =
  | "ingest_source"
  | "ingest_video"
  | "sync_source"
  | "generate_skill_content";
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type JobProgress = IngestProgress | Record<string, unknown>;

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
  /** All Sources, newest first — both implementations must honour this order. */
  listSources(): Promise<SourceRecord[]>;
  /**
   * Hard-deletes a Source and its membership rows (source_videos,
   * collection_sources cascade). Videos referenced by no other Source are
   * garbage-collected (orphan rule); shared Videos are kept. Returns false when
   * the Source does not exist.
   */
  deleteSource(id: string): Promise<boolean>;
  /** Collection-type Sources (channel/playlist), newest first — Sync targets. */
  listCollectionTypeSources(): Promise<SourceRecord[]>;
  /** All membership rows for a Source, including upstream-removed tombstones. */
  listSourceVideoLinks(sourceId: string): Promise<SourceVideoLink[]>;
  /** Sets (or clears, with null) a membership row's upstream-removal tombstone. */
  setSourceVideoRemoved(
    sourceId: string,
    videoId: string,
    removedAt: Date | null,
  ): Promise<void>;
  updateSourceSyncState(
    sourceId: string,
    patch: { lastSyncedAt?: Date; lastManualSyncAt?: Date },
  ): Promise<void>;
  /**
   * Atomically claims the manual-Sync slot: stamps last_manual_sync_at = now
   * only if the previous manual Sync is older than intervalMs (or never).
   * Returns whether this caller won — races can't both pass the 24h cap.
   */
  tryClaimManualSync(
    sourceId: string,
    now: Date,
    intervalMs: number,
  ): Promise<boolean>;
  /** A queued/running sync_source Job for the Source, if any (one at a time). */
  findActiveSyncSourceJob(sourceId: string): Promise<JobRecord | undefined>;
  /**
   * The most recent sync_source Job for the Source that added new Videos and
   * has not yet decided on regeneration (progress.newVideoIds set,
   * progress.regenSettled falsy) — the barrier for conditional regen.
   */
  findRegenPendingSyncSourceJob(
    sourceId: string,
  ): Promise<JobRecord | undefined>;
  /**
   * Atomically claims the conditional-regen decision for a sync_source Job by
   * setting progress.regenSettled, returning whether this caller won. Prevents
   * concurrent ingest_video completions from enqueuing duplicate regens.
   */
  claimSyncSourceRegen(jobId: string): Promise<boolean>;

  createCollection(input: { name: string }): Promise<CollectionRecord>;
  getCollection(id: string): Promise<CollectionRecord | undefined>;
  /** All Collections, newest first. */
  listCollections(): Promise<CollectionRecord[]>;
  renameCollection(
    id: string,
    name: string,
  ): Promise<CollectionRecord | undefined>;
  deleteCollection(id: string): Promise<boolean>;
  /** Adds a Source to a Collection; idempotent. */
  addSourceToCollection(
    collectionId: string,
    sourceId: string,
  ): Promise<void>;
  /** Returns false when the membership row did not exist. */
  removeSourceFromCollection(
    collectionId: string,
    sourceId: string,
  ): Promise<boolean>;
  listCollectionSourceIds(collectionId: string): Promise<string[]>;

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
