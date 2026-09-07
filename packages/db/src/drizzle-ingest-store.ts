import { and, desc, eq, inArray, notInArray, or, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  chunks,
  collectionSources,
  collections,
  jobs,
  sourceVideos,
  sources,
  transcripts,
  videos,
} from "./schema";
import {
  ZERO_PROGRESS,
  type CollectionRecord,
  type IngestStore,
  type JobProgress,
  type JobRecord,
  type SourceRecord,
  type StoredChunk,
  type TranscriptRecord,
  type VideoRecord,
} from "./ingest-store";

function sourceFromRow(row: typeof sources.$inferSelect): SourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    youtubeId: row.youtubeId,
    url: row.url,
    title: row.title,
    lastSyncedAt: row.lastSyncedAt,
    lastManualSyncAt: row.lastManualSyncAt,
  };
}

function collectionFromRow(
  row: typeof collections.$inferSelect,
): CollectionRecord {
  return { id: row.id, name: row.name };
}

function videoFromRow(row: typeof videos.$inferSelect): VideoRecord {
  return {
    id: row.id,
    youtubeVideoId: row.youtubeVideoId,
    title: row.title,
    description: row.description,
    durationSec: row.durationSec,
    channelYoutubeId: row.channelYoutubeId,
    chapters: row.chapters,
    thumbnails: row.thumbnails,
    status: row.status,
    lastIngestError: row.lastIngestError,
    ingestedAt: row.ingestedAt,
  };
}

function progressFromJson(
  kind: typeof jobs.$inferSelect.kind,
  value: Record<string, unknown>,
): JobProgress {
  if (kind === "generate_skill_content" || kind === "sync_source") {
    return value;
  }
  return {
    discovered: Number(value.discovered ?? 0),
    ready: Number(value.ready ?? 0),
    unavailable: Number(value.unavailable ?? 0),
    error: Number(value.error ?? 0),
  };
}

function jobFromRow(row: typeof jobs.$inferSelect): JobRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    sourceId: row.sourceId,
    videoId: row.videoId,
    progress: progressFromJson(row.kind, row.progress),
    error: row.error,
  };
}

export function createDrizzleIngestStore(db: Database): IngestStore {
  return {
    async createSource(input) {
      const [row] = await db
        .insert(sources)
        .values({
          kind: input.kind,
          youtubeId: input.youtubeId,
          url: input.url,
          title: input.title ?? null,
        })
        .returning();
      return sourceFromRow(row!);
    },

    async findSourceByKindAndYoutubeId(kind, youtubeId) {
      const [row] = await db
        .select()
        .from(sources)
        .where(
          and(eq(sources.kind, kind), eq(sources.youtubeId, youtubeId)),
        )
        .limit(1);
      return row ? sourceFromRow(row) : undefined;
    },

    async getSource(id) {
      const [row] = await db
        .select()
        .from(sources)
        .where(eq(sources.id, id))
        .limit(1);
      return row ? sourceFromRow(row) : undefined;
    },

    async listSources() {
      const rows = await db
        .select()
        .from(sources)
        .orderBy(desc(sources.createdAt));
      return rows.map(sourceFromRow);
    },

    async deleteSource(id) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: sources.id })
          .from(sources)
          .where(eq(sources.id, id))
          .limit(1);
        if (!existing) {
          return false;
        }
        // Candidate orphans: only Videos this Source referenced (mirrors the
        // orphanVideoIdsAfterSourceRemoved domain rule — scoped, not global).
        const candidateRows = await tx
          .select({ videoId: sourceVideos.videoId })
          .from(sourceVideos)
          .where(eq(sourceVideos.sourceId, id));
        const candidateIds = candidateRows.map((row) => row.videoId);

        // Deleting the Source cascades source_videos and collection_sources.
        await tx.delete(sources).where(eq(sources.id, id));

        if (candidateIds.length > 0) {
          // Of the candidates, drop the ones no remaining Source references.
          const stillReferenced = tx
            .select({ videoId: sourceVideos.videoId })
            .from(sourceVideos);
          await tx
            .delete(videos)
            .where(
              and(
                inArray(videos.id, candidateIds),
                notInArray(videos.id, stillReferenced),
              ),
            );
        }
        return true;
      });
    },

    async createCollection(input) {
      const [row] = await db
        .insert(collections)
        .values({ name: input.name })
        .returning();
      return collectionFromRow(row!);
    },

    async getCollection(id) {
      const [row] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
        .limit(1);
      return row ? collectionFromRow(row) : undefined;
    },

    async listCollections() {
      const rows = await db
        .select()
        .from(collections)
        .orderBy(desc(collections.createdAt));
      return rows.map(collectionFromRow);
    },

    async renameCollection(id, name) {
      const [row] = await db
        .update(collections)
        .set({ name, updatedAt: new Date() })
        .where(eq(collections.id, id))
        .returning();
      return row ? collectionFromRow(row) : undefined;
    },

    async deleteCollection(id) {
      const rows = await db
        .delete(collections)
        .where(eq(collections.id, id))
        .returning({ id: collections.id });
      return rows.length > 0;
    },

    async addSourceToCollection(collectionId, sourceId) {
      await db
        .insert(collectionSources)
        .values({ collectionId, sourceId })
        .onConflictDoNothing();
    },

    async removeSourceFromCollection(collectionId, sourceId) {
      const rows = await db
        .delete(collectionSources)
        .where(
          and(
            eq(collectionSources.collectionId, collectionId),
            eq(collectionSources.sourceId, sourceId),
          ),
        )
        .returning({ sourceId: collectionSources.sourceId });
      return rows.length > 0;
    },

    async listCollectionSourceIds(collectionId) {
      const rows = await db
        .select({ sourceId: collectionSources.sourceId })
        .from(collectionSources)
        .where(eq(collectionSources.collectionId, collectionId));
      return rows.map((row) => row.sourceId);
    },

    async upsertVideo(input) {
      const [existing] = await db
        .select()
        .from(videos)
        .where(eq(videos.youtubeVideoId, input.youtubeVideoId))
        .limit(1);
      if (existing) {
        const [updated] = await db
          .update(videos)
          .set({
            title: input.title ?? existing.title,
            description: input.description ?? existing.description,
            durationSec: input.durationSec ?? existing.durationSec,
            channelYoutubeId: input.channelYoutubeId ?? existing.channelYoutubeId,
            chapters: input.chapters ?? existing.chapters,
            thumbnails: input.thumbnails ?? existing.thumbnails,
            status: input.status ?? existing.status,
            updatedAt: new Date(),
          })
          .where(eq(videos.id, existing.id))
          .returning();
        return videoFromRow(updated!);
      }
      const [row] = await db
        .insert(videos)
        .values({
          youtubeVideoId: input.youtubeVideoId,
          title: input.title ?? null,
          description: input.description ?? null,
          durationSec: input.durationSec ?? null,
          channelYoutubeId: input.channelYoutubeId ?? null,
          chapters: input.chapters ?? [],
          thumbnails: input.thumbnails ?? {},
          status: input.status ?? "discovered",
        })
        .returning();
      return videoFromRow(row!);
    },

    async getVideo(id) {
      const [row] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, id))
        .limit(1);
      return row ? videoFromRow(row) : undefined;
    },

    async updateVideo(id, patch) {
      const [row] = await db
        .update(videos)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(videos.id, id))
        .returning();
      if (!row) {
        throw new Error(`Video ${id} not found`);
      }
      return videoFromRow(row);
    },

    async listVideosForSource(sourceId) {
      const rows = await db
        .select({ video: videos })
        .from(sourceVideos)
        .innerJoin(videos, eq(sourceVideos.videoId, videos.id))
        .where(eq(sourceVideos.sourceId, sourceId));
      return rows.map((row) => videoFromRow(row.video));
    },

    async ensureSourceVideo(sourceId, videoId) {
      await db
        .insert(sourceVideos)
        .values({ sourceId, videoId })
        .onConflictDoNothing();
    },

    async createJob(input) {
      const [row] = await db
        .insert(jobs)
        .values({
          kind: input.kind,
          sourceId: input.sourceId ?? null,
          videoId: input.videoId ?? null,
          progress: input.progress ?? { ...ZERO_PROGRESS },
        })
        .returning();
      return jobFromRow(row!);
    },

    async getJob(id) {
      const [row] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, id))
        .limit(1);
      return row ? jobFromRow(row) : undefined;
    },

    async updateJob(id, patch) {
      const [row] = await db
        .update(jobs)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id))
        .returning();
      if (!row) {
        throw new Error(`Job ${id} not found`);
      }
      return jobFromRow(row);
    },

    async findActiveIngestSourceJob(sourceId) {
      const [row] = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.sourceId, sourceId),
            eq(jobs.kind, "ingest_source"),
            inArray(jobs.status, ["queued", "running"]),
          ),
        )
        .limit(1);
      return row ? jobFromRow(row) : undefined;
    },

    async listCollectionTypeSources() {
      const rows = await db
        .select()
        .from(sources)
        .where(inArray(sources.kind, ["channel", "playlist"]))
        .orderBy(desc(sources.createdAt));
      return rows.map(sourceFromRow);
    },

    async listSourceVideoLinks(sourceId) {
      const rows = await db
        .select({
          videoId: videos.id,
          youtubeVideoId: videos.youtubeVideoId,
          status: videos.status,
          removedFromUpstreamAt: sourceVideos.removedFromUpstreamAt,
        })
        .from(sourceVideos)
        .innerJoin(videos, eq(sourceVideos.videoId, videos.id))
        .where(eq(sourceVideos.sourceId, sourceId));
      return rows;
    },

    async setSourceVideoRemoved(sourceId, videoId, removedAt) {
      await db
        .update(sourceVideos)
        .set({ removedFromUpstreamAt: removedAt })
        .where(
          and(
            eq(sourceVideos.sourceId, sourceId),
            eq(sourceVideos.videoId, videoId),
          ),
        );
    },

    async updateSourceSyncState(sourceId, patch) {
      await db
        .update(sources)
        .set({
          ...(patch.lastSyncedAt ? { lastSyncedAt: patch.lastSyncedAt } : {}),
          ...(patch.lastManualSyncAt
            ? { lastManualSyncAt: patch.lastManualSyncAt }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(sources.id, sourceId));
    },

    async tryClaimManualSync(sourceId, now, intervalMs) {
      const cutoff = new Date(now.getTime() - intervalMs);
      const rows = await db
        .update(sources)
        .set({ lastManualSyncAt: now, updatedAt: now })
        .where(
          and(
            eq(sources.id, sourceId),
            or(
              isNull(sources.lastManualSyncAt),
              lt(sources.lastManualSyncAt, cutoff),
            ),
          ),
        )
        .returning({ id: sources.id });
      return rows.length > 0;
    },

    async findActiveSyncSourceJob(sourceId) {
      const [row] = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.sourceId, sourceId),
            eq(jobs.kind, "sync_source"),
            inArray(jobs.status, ["queued", "running"]),
          ),
        )
        .limit(1);
      return row ? jobFromRow(row) : undefined;
    },

    async findRegenPendingSyncSourceJob(sourceId) {
      // The regen barrier reads progress JSON, so filter recent sync_source
      // Jobs in memory rather than with a JSON predicate.
      const rows = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.sourceId, sourceId), eq(jobs.kind, "sync_source")))
        .orderBy(desc(jobs.createdAt));
      for (const row of rows) {
        const progress = row.progress as Record<string, unknown>;
        const newVideoIds = progress.newVideoIds;
        if (
          Array.isArray(newVideoIds) &&
          newVideoIds.length > 0 &&
          progress.regenSettled !== true
        ) {
          return jobFromRow(row);
        }
      }
      return undefined;
    },

    async claimSyncSourceRegen(jobId) {
      const rows = await db
        .update(jobs)
        .set({
          progress: sql`${jobs.progress} || '{"regenSettled":true}'::jsonb`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobs.id, jobId),
            sql`coalesce(${jobs.progress}->>'regenSettled', '') <> 'true'`,
          ),
        )
        .returning({ id: jobs.id });
      return rows.length > 0;
    },

    async saveTranscript(record: TranscriptRecord) {
      await db
        .insert(transcripts)
        .values({
          videoId: record.videoId,
          language: record.language,
          isAsr: record.isAsr,
          segments: record.segments,
          normalizedSegments: record.normalizedSegments,
        })
        .onConflictDoUpdate({
          target: transcripts.videoId,
          set: {
            language: record.language,
            isAsr: record.isAsr,
            segments: record.segments,
            normalizedSegments: record.normalizedSegments,
            fetchedAt: new Date(),
          },
        });
    },

    async replaceChunks(videoId, rows: StoredChunk[]) {
      await db.delete(chunks).where(eq(chunks.videoId, videoId));
      if (rows.length === 0) {
        return;
      }
      await db.insert(chunks).values(
        rows.map((chunk) => ({
          videoId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startSec: chunk.startSec,
          endSec: chunk.endSec,
          citeStartSec: chunk.citeStartSec,
          citeEndSec: chunk.citeEndSec,
          chapterTitle: chunk.chapterTitle,
          tokenCount: chunk.tokenCount,
          embedding: chunk.embedding ?? undefined,
          chunkingVersion: chunk.chunkingVersion,
          embeddingModel: chunk.embeddingModel,
        })),
      );
    },

    async listChunks(videoId) {
      const rows = await db
        .select()
        .from(chunks)
        .where(eq(chunks.videoId, videoId));
      return rows.map((row) => ({
        chunkIndex: row.chunkIndex,
        content: row.content,
        startSec: row.startSec,
        endSec: row.endSec,
        citeStartSec: row.citeStartSec,
        citeEndSec: row.citeEndSec,
        chapterTitle: row.chapterTitle,
        tokenCount: row.tokenCount,
        embedding: row.embedding,
        chunkingVersion: row.chunkingVersion,
        embeddingModel: row.embeddingModel,
      }));
    },

    async getTranscript(videoId) {
      const [row] = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.videoId, videoId))
        .limit(1);
      if (!row) {
        return undefined;
      }
      return {
        videoId: row.videoId,
        language: row.language,
        isAsr: row.isAsr,
        segments: row.segments,
        normalizedSegments: row.normalizedSegments,
      };
    },
  };
}
