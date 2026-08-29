import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** OpenAI text-embedding-3-* 1536-dim vectors. */
export const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (trimmed.length === 0) {
      return [];
    }
    return trimmed.split(",").map(Number);
  },
});

export const sourceKindEnum = pgEnum("source_kind", [
  "video",
  "channel",
  "playlist",
]);

export const videoStatusEnum = pgEnum("video_status", [
  "discovered",
  "pending_transcript",
  "ready",
  "unavailable",
  "error",
]);

export const jobKindEnum = pgEnum("job_kind", [
  "ingest_source",
  "ingest_video",
  "sync_source",
  "generate_skill_content",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const scopeKindEnum = pgEnum("scope_kind", [
  "source",
  "collection",
  "library",
]);

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
  "system",
]);

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: sourceKindEnum("kind").notNull(),
    /** Channel id, playlist id, or video id depending on kind. */
    youtubeId: text("youtube_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Opaque Sync cursor (e.g. uploads-playlist page token). */
    syncCursor: text("sync_cursor"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("sources_kind_youtube_id_uidx").on(table.kind, table.youtubeId),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    youtubeVideoId: text("youtube_video_id").notNull(),
    title: text("title"),
    description: text("description"),
    durationSec: integer("duration_sec"),
    channelYoutubeId: text("channel_youtube_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    chapters: jsonb("chapters").$type<Array<{ startSec: number; title: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    thumbnails: jsonb("thumbnails").$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: videoStatusEnum("status").notNull().default("discovered"),
    lastIngestError: text("last_ingest_error"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("videos_youtube_video_id_uidx").on(table.youtubeVideoId),
    index("videos_status_idx").on(table.status),
  ],
);

export const sourceVideos = pgTable(
  "source_videos",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedFromUpstreamAt: timestamp("removed_from_upstream_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.videoId] }),
    index("source_videos_video_id_idx").on(table.videoId),
  ],
);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt,
  updatedAt,
});

export const collectionSources = pgTable(
  "collection_sources",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.sourceId] }),
  ],
);

export type TranscriptSegment = {
  text: string;
  startMs: number;
  durationMs: number;
};

/** Deterministic Citation payload stored on chat messages (glossary: Citation). */
export type CitationRef = {
  videoId: string;
  youtubeVideoId: string;
  citeStartSec: number;
  citeEndSec: number;
  chunkId?: string;
};

export const transcripts = pgTable("transcripts", {
  videoId: uuid("video_id")
    .primaryKey()
    .references(() => videos.id, { onDelete: "cascade" }),
  language: text("language"),
  isAsr: boolean("is_asr").notNull().default(false),
  segments: jsonb("segments").$type<TranscriptSegment[]>().notNull(),
  normalizedSegments: jsonb("normalized_segments")
    .$type<TranscriptSegment[]>()
    .notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    /** Full window including overlap (debug / highlight). */
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    /** Core (non-overlap) span used for Citations. */
    citeStartSec: real("cite_start_sec").notNull(),
    citeEndSec: real("cite_end_sec").notNull(),
    chapterTitle: text("chapter_title"),
    tokenCount: integer("token_count").notNull(),
    embedding: vector1536("embedding"),
    /**
     * Hybrid FTS column + HNSW cosine index are owned by the SQL migration
     * (`search_vector` generated tsvector + GIN, `chunks_embedding_hnsw`) per R6 —
     * not declared here to avoid the drizzle-kit HNSW opclass bug.
     */
    chunkingVersion: text("chunking_version").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("chunks_video_id_chunk_index_uidx").on(
      table.videoId,
      table.chunkIndex,
    ),
    index("chunks_video_id_idx").on(table.videoId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: jobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    videoId: uuid("video_id").references(() => videos.id, {
      onDelete: "set null",
    }),
    progress: jsonb("progress").$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    createdAt,
    updatedAt,
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_status_idx").on(table.status),
    index("jobs_source_id_idx").on(table.sourceId),
    index("jobs_video_id_idx").on(table.videoId),
  ],
);

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeKind: scopeKindEnum("scope_kind").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "cascade",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("chats_scope_idx").on(table.scopeKind, table.sourceId, table.collectionId),
    // Scope XOR enforced in migration SQL (CHECK chats_scope_chk).
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations")
      .$type<CitationRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt,
  },
  (table) => [index("chat_messages_chat_id_idx").on(table.chatId)],
);

export const skillContentArtifacts = pgTable(
  "skill_content_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeKind: scopeKindEnum("scope_kind").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "cascade",
    }),
    version: integer("version").notNull(),
    markdown: text("markdown").notNull(),
    bestPracticesTemplateVersion: text("best_practices_template_version").notNull(),
    modelStamps: jsonb("model_stamps").$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Uniqueness with NULLS NOT DISTINCT is in migration SQL (library Scope).
    uniqueIndex("skill_content_scope_version_uidx").on(
      table.scopeKind,
      table.sourceId,
      table.collectionId,
      table.version,
    ),
    index("skill_content_scope_idx").on(
      table.scopeKind,
      table.sourceId,
      table.collectionId,
    ),
    // Scope XOR enforced in migration SQL (CHECK skill_content_scope_chk).
  ],
);
