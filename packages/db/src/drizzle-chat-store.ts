import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ChatScope } from "@aulus/types";
import type { Database } from "./client";
import {
  chatMessages,
  chats,
  chunks,
  collectionSources,
  sourceVideos,
  videos,
} from "./schema";
import type {
  ChatMessageRecord,
  ChatRecord,
  ChatStore,
  RetrievedChunk,
} from "./chat-store";
import { videoIdsForScope } from "./domain/video-ids-for-scope";
import { hybridSearchChunks } from "./retrieval/hybrid-search";

function chatFromRow(row: typeof chats.$inferSelect): ChatRecord {
  return {
    id: row.id,
    scopeKind: row.scopeKind,
    sourceId: row.sourceId,
    collectionId: row.collectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function messageFromRow(row: typeof chatMessages.$inferSelect): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role,
    content: row.content,
    citations: row.citations,
    createdAt: row.createdAt,
  };
}

function chunkFromJoin(row: {
  chunk: typeof chunks.$inferSelect;
  youtubeVideoId: string;
}): RetrievedChunk {
  return {
    id: row.chunk.id,
    videoId: row.chunk.videoId,
    youtubeVideoId: row.youtubeVideoId,
    chunkIndex: row.chunk.chunkIndex,
    content: row.chunk.content,
    citeStartSec: row.chunk.citeStartSec,
    citeEndSec: row.chunk.citeEndSec,
    chapterTitle: row.chunk.chapterTitle,
  };
}

function scopeToInsert(scope: ChatScope): typeof chats.$inferInsert {
  switch (scope.kind) {
    case "library":
      return { scopeKind: "library", sourceId: null, collectionId: null };
    case "source":
      return {
        scopeKind: "source",
        sourceId: scope.sourceId,
        collectionId: null,
      };
    case "collection":
      return {
        scopeKind: "collection",
        sourceId: null,
        collectionId: scope.collectionId,
      };
  }
}

export function createDrizzleChatStore(db: Database): ChatStore {
  return {
    async createChat(scope) {
      const [row] = await db
        .insert(chats)
        .values(scopeToInsert(scope))
        .returning();
      return chatFromRow(row!);
    },

    async getChat(id) {
      const [row] = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1);
      return row ? chatFromRow(row) : undefined;
    },

    async listChats() {
      const rows = await db
        .select()
        .from(chats)
        .orderBy(desc(chats.createdAt));
      return rows.map(chatFromRow);
    },

    async deleteChat(id) {
      const deleted = await db
        .delete(chats)
        .where(eq(chats.id, id))
        .returning({ id: chats.id });
      return deleted.length > 0;
    },

    async listMessages(chatId) {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.chatId, chatId))
        .orderBy(chatMessages.createdAt);
      return rows.map(messageFromRow);
    },

    async appendMessage(input) {
      const [row] = await db
        .insert(chatMessages)
        .values({
          chatId: input.chatId,
          role: input.role,
          content: input.content,
          citations: input.citations ?? [],
        })
        .returning();
      return messageFromRow(row!);
    },

    async getMembershipSnapshot() {
      const [sourceVideoRows, collectionSourceRows] = await Promise.all([
        db
          .select({
            sourceId: sourceVideos.sourceId,
            videoId: sourceVideos.videoId,
          })
          .from(sourceVideos)
          .where(isNull(sourceVideos.removedFromUpstreamAt)),
        db
          .select({
            collectionId: collectionSources.collectionId,
            sourceId: collectionSources.sourceId,
          })
          .from(collectionSources),
      ]);
      return {
        sourceVideos: sourceVideoRows,
        collectionSources: collectionSourceRows,
      };
    },

    async countReadyVideosInScope(scope) {
      const membership = await this.getMembershipSnapshot();
      const videoIds = [...videoIdsForScope(scope, membership)];
      if (videoIds.length === 0) {
        return 0;
      }
      const rows = await db
        .select({ id: videos.id })
        .from(videos)
        .where(and(inArray(videos.id, videoIds), eq(videos.status, "ready")));
      return rows.length;
    },

    async hybridSearch(input) {
      return hybridSearchChunks(db, input);
    },

    async getChunksByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .select({
          chunk: chunks,
          youtubeVideoId: videos.youtubeVideoId,
        })
        .from(chunks)
        .innerJoin(videos, eq(chunks.videoId, videos.id))
        .where(inArray(chunks.id, [...ids]));
      return rows.map(chunkFromJoin);
    },

    async listChunksForVideos(videoIds) {
      if (videoIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({
          chunk: chunks,
          youtubeVideoId: videos.youtubeVideoId,
        })
        .from(chunks)
        .innerJoin(videos, eq(chunks.videoId, videos.id))
        .where(inArray(chunks.videoId, [...videoIds]))
        .orderBy(chunks.videoId, chunks.chunkIndex);
      return rows.map(chunkFromJoin);
    },
  };
}
