import type { SourceKind } from "@aulus/types";
import {
  ZERO_PROGRESS,
  type CollectionRecord,
  type IngestStore,
  type JobKind,
  type JobProgress,
  type JobRecord,
  type SourceRecord,
  type StoredChunk,
  type TranscriptRecord,
  type VideoRecord,
} from "./ingest-store";
import { orphanVideoIdsAfterSourceRemoved } from "./domain/orphan-videos-after-source-removed";
import type { VideoStatusValue } from "./domain/source-ingestion-status";

function newId(): string {
  return crypto.randomUUID();
}

/**
 * In-memory IngestStore for tests (seam ③/④ fixture).
 */
export function createMemoryIngestStore(): IngestStore {
  const sources = new Map<string, SourceRecord>();
  const videos = new Map<string, VideoRecord>();
  const videosByYoutubeId = new Map<string, string>();
  const sourceVideoLinks = new Set<string>();
  const collections = new Map<string, CollectionRecord>();
  const collectionSourceLinks = new Set<string>();
  const jobs = new Map<string, JobRecord>();
  const transcripts = new Map<string, TranscriptRecord>();
  const chunks = new Map<string, StoredChunk[]>();

  return {
    async createSource(input) {
      const record: SourceRecord = {
        id: newId(),
        kind: input.kind,
        youtubeId: input.youtubeId,
        url: input.url,
        title: input.title ?? null,
      };
      sources.set(record.id, record);
      return record;
    },

    async findSourceByKindAndYoutubeId(kind: SourceKind, youtubeId: string) {
      for (const record of sources.values()) {
        if (record.kind === kind && record.youtubeId === youtubeId) {
          return record;
        }
      }
      return undefined;
    },

    async getSource(id) {
      return sources.get(id);
    },

    async listSources() {
      // Newest first, mirroring the Drizzle store's ordering.
      return [...sources.values()].reverse();
    },

    async deleteSource(id) {
      if (!sources.has(id)) {
        return false;
      }

      const membershipBeforeDelete = [...sourceVideoLinks].map((key) => {
        const [sourceId, videoId] = key.split(":");
        return { sourceId: sourceId!, videoId: videoId! };
      });
      const orphaned = orphanVideoIdsAfterSourceRemoved(
        membershipBeforeDelete,
        id,
      );

      sources.delete(id);
      for (const key of sourceVideoLinks) {
        if (key.startsWith(`${id}:`)) {
          sourceVideoLinks.delete(key);
        }
      }
      for (const key of collectionSourceLinks) {
        if (key.endsWith(`:${id}`)) {
          collectionSourceLinks.delete(key);
        }
      }
      for (const videoId of orphaned) {
        const video = videos.get(videoId);
        if (video) {
          videosByYoutubeId.delete(video.youtubeVideoId);
        }
        videos.delete(videoId);
        transcripts.delete(videoId);
        chunks.delete(videoId);
      }
      return true;
    },

    async createCollection(input) {
      const record: CollectionRecord = { id: newId(), name: input.name };
      collections.set(record.id, record);
      return record;
    },

    async getCollection(id) {
      return collections.get(id);
    },

    async listCollections() {
      // Newest first, mirroring the Drizzle store's ordering.
      return [...collections.values()].reverse();
    },

    async renameCollection(id, name) {
      const existing = collections.get(id);
      if (!existing) {
        return undefined;
      }
      const updated = { ...existing, name };
      collections.set(id, updated);
      return updated;
    },

    async deleteCollection(id) {
      if (!collections.has(id)) {
        return false;
      }
      collections.delete(id);
      for (const key of collectionSourceLinks) {
        if (key.startsWith(`${id}:`)) {
          collectionSourceLinks.delete(key);
        }
      }
      return true;
    },

    async addSourceToCollection(collectionId, sourceId) {
      collectionSourceLinks.add(`${collectionId}:${sourceId}`);
    },

    async removeSourceFromCollection(collectionId, sourceId) {
      return collectionSourceLinks.delete(`${collectionId}:${sourceId}`);
    },

    async listCollectionSourceIds(collectionId) {
      const result: string[] = [];
      for (const key of collectionSourceLinks) {
        const [cid, sourceId] = key.split(":");
        if (cid === collectionId) {
          result.push(sourceId!);
        }
      }
      return result;
    },

    async upsertVideo(input) {
      const existingId = videosByYoutubeId.get(input.youtubeVideoId);
      if (existingId) {
        const existing = videos.get(existingId)!;
        const updated: VideoRecord = {
          ...existing,
          title: input.title ?? existing.title,
          description: input.description ?? existing.description,
          durationSec: input.durationSec ?? existing.durationSec,
          channelYoutubeId: input.channelYoutubeId ?? existing.channelYoutubeId,
          chapters: input.chapters ?? existing.chapters,
          thumbnails: input.thumbnails ?? existing.thumbnails,
          status: input.status ?? existing.status,
        };
        videos.set(existingId, updated);
        return updated;
      }
      const record: VideoRecord = {
        id: newId(),
        youtubeVideoId: input.youtubeVideoId,
        title: input.title ?? null,
        description: input.description ?? null,
        durationSec: input.durationSec ?? null,
        channelYoutubeId: input.channelYoutubeId ?? null,
        chapters: input.chapters ?? [],
        thumbnails: input.thumbnails ?? {},
        status: input.status ?? "discovered",
        lastIngestError: null,
        ingestedAt: null,
      };
      videos.set(record.id, record);
      videosByYoutubeId.set(input.youtubeVideoId, record.id);
      return record;
    },

    async getVideo(id) {
      return videos.get(id);
    },

    async updateVideo(id, patch) {
      const existing = videos.get(id);
      if (!existing) {
        throw new Error(`Video ${id} not found`);
      }
      const updated = { ...existing, ...patch };
      videos.set(id, updated);
      return updated;
    },

    async listVideosForSource(sourceId) {
      const result: VideoRecord[] = [];
      for (const key of sourceVideoLinks) {
        const [sid, videoId] = key.split(":");
        if (sid === sourceId) {
          const video = videos.get(videoId!);
          if (video) {
            result.push(video);
          }
        }
      }
      return result;
    },

    async ensureSourceVideo(sourceId, videoId) {
      sourceVideoLinks.add(`${sourceId}:${videoId}`);
    },

    async createJob(input: {
      kind: JobKind;
      sourceId?: string | null;
      videoId?: string | null;
      progress?: JobProgress;
    }) {
      const record: JobRecord = {
        id: newId(),
        kind: input.kind,
        status: "queued",
        sourceId: input.sourceId ?? null,
        videoId: input.videoId ?? null,
        progress: input.progress ?? { ...ZERO_PROGRESS },
        error: null,
      };
      jobs.set(record.id, record);
      return record;
    },

    async getJob(id) {
      return jobs.get(id);
    },

    async updateJob(id, patch) {
      const existing = jobs.get(id);
      if (!existing) {
        throw new Error(`Job ${id} not found`);
      }
      const updated = { ...existing, ...patch };
      jobs.set(id, updated);
      return updated;
    },

    async findActiveIngestSourceJob(sourceId) {
      for (const job of jobs.values()) {
        if (
          job.sourceId === sourceId &&
          job.kind === "ingest_source" &&
          (job.status === "queued" || job.status === "running")
        ) {
          return job;
        }
      }
      return undefined;
    },

    async saveTranscript(record) {
      transcripts.set(record.videoId, record);
    },

    async replaceChunks(videoId, rows: StoredChunk[]) {
      chunks.set(videoId, rows);
    },

    async listChunks(videoId) {
      return chunks.get(videoId) ?? [];
    },

    async getTranscript(videoId) {
      return transcripts.get(videoId);
    },
  };
}

export type { VideoStatusValue };
