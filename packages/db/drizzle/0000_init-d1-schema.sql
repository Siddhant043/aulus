CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('ingest_source', 'ingest_video', 'sync_source', 'generate_skill_content');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scope_kind" AS ENUM('source', 'collection', 'library');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('video', 'channel', 'playlist');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('discovered', 'pending_transcript', 'ready', 'unavailable', 'error');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_kind" "scope_kind" NOT NULL,
	"source_id" uuid,
	"collection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"start_sec" real NOT NULL,
	"end_sec" real NOT NULL,
	"cite_start_sec" real NOT NULL,
	"cite_end_sec" real NOT NULL,
	"chapter_title" text,
	"token_count" integer NOT NULL,
	"embedding" vector(1536),
	"chunking_version" text NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_sources" (
	"collection_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "collection_sources_collection_id_source_id_pk" PRIMARY KEY("collection_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"source_id" uuid,
	"video_id" uuid,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill_content_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_kind" "scope_kind" NOT NULL,
	"source_id" uuid,
	"collection_id" uuid,
	"version" integer NOT NULL,
	"markdown" text NOT NULL,
	"best_practices_template_version" text NOT NULL,
	"model_stamps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_videos" (
	"source_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"position" integer,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_from_upstream_at" timestamp with time zone,
	CONSTRAINT "source_videos_source_id_video_id_pk" PRIMARY KEY("source_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"youtube_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"last_synced_at" timestamp with time zone,
	"sync_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"language" text,
	"is_asr" boolean DEFAULT false NOT NULL,
	"segments" jsonb NOT NULL,
	"normalized_segments" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text,
	"description" text,
	"duration_sec" integer,
	"channel_youtube_id" text,
	"published_at" timestamp with time zone,
	"chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thumbnails" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "video_status" DEFAULT 'discovered' NOT NULL,
	"last_ingest_error" text,
	"ingested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sources" ADD CONSTRAINT "collection_sources_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_sources" ADD CONSTRAINT "collection_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_content_artifacts" ADD CONSTRAINT "skill_content_artifacts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_content_artifacts" ADD CONSTRAINT "skill_content_artifacts_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_videos" ADD CONSTRAINT "source_videos_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_videos" ADD CONSTRAINT "source_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_chat_id_idx" ON "chat_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chats_scope_idx" ON "chats" USING btree ("scope_kind","source_id","collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_video_id_chunk_index_uidx" ON "chunks" USING btree ("video_id","chunk_index");--> statement-breakpoint
CREATE INDEX "chunks_video_id_idx" ON "chunks" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_source_id_idx" ON "jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "jobs_video_id_idx" ON "jobs" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_content_scope_version_uidx" ON "skill_content_artifacts" USING btree ("scope_kind","source_id","collection_id","version") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "skill_content_scope_idx" ON "skill_content_artifacts" USING btree ("scope_kind","source_id","collection_id");--> statement-breakpoint
CREATE INDEX "source_videos_video_id_idx" ON "source_videos" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_kind_youtube_id_uidx" ON "sources" USING btree ("kind","youtube_id");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_youtube_video_id_uidx" ON "videos" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;--> statement-breakpoint
CREATE INDEX "chunks_search_vector_gin" ON "chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 128);--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_scope_chk" CHECK (
  ("scope_kind" = 'library' AND "source_id" IS NULL AND "collection_id" IS NULL)
  OR ("scope_kind" = 'source' AND "source_id" IS NOT NULL AND "collection_id" IS NULL)
  OR ("scope_kind" = 'collection' AND "collection_id" IS NOT NULL AND "source_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "skill_content_artifacts" ADD CONSTRAINT "skill_content_scope_chk" CHECK (
  ("scope_kind" = 'library' AND "source_id" IS NULL AND "collection_id" IS NULL)
  OR ("scope_kind" = 'source' AND "source_id" IS NOT NULL AND "collection_id" IS NULL)
  OR ("scope_kind" = 'collection' AND "collection_id" IS NOT NULL AND "source_id" IS NULL)
);