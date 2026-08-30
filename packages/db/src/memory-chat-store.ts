import type { ChatScope } from "@aulus/types";
import type { Scope } from "./domain/video-ids-for-scope";
import { videoIdsForScope } from "./domain/video-ids-for-scope";
import type {
  ChatMessageRecord,
  ChatRecord,
  ChatStore,
  RetrievedChunk,
} from "./chat-store";

function newId(): string {
  return crypto.randomUUID();
}

function scopeToRecord(scope: ChatScope): Pick<
  ChatRecord,
  "scopeKind" | "sourceId" | "collectionId"
> {
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export type MemoryChatStoreSeed = {
  sourceVideos?: Array<{ sourceId: string; videoId: string }>;
  collectionSources?: Array<{ collectionId: string; sourceId: string }>;
  readyVideoIds?: ReadonlySet<string>;
  chunks?: readonly RetrievedChunk[];
};

/**
 * In-memory ChatStore for tests.
 */
export function createMemoryChatStore(
  seed: MemoryChatStoreSeed = {},
): ChatStore {
  const chats = new Map<string, ChatRecord>();
  const messages = new Map<string, ChatMessageRecord[]>();
  const sourceVideoLinks = [...(seed.sourceVideos ?? [])];
  const collectionSources = [...(seed.collectionSources ?? [])];
  const readyVideoIds = new Set(seed.readyVideoIds ?? []);
  const chunkIndex = new Map<string, RetrievedChunk>(
    (seed.chunks ?? []).map((chunk) => [chunk.id, chunk]),
  );

  return {
    async createChat(scope) {
      const now = new Date();
      const record: ChatRecord = {
        id: newId(),
        ...scopeToRecord(scope),
        createdAt: now,
        updatedAt: now,
      };
      chats.set(record.id, record);
      messages.set(record.id, []);
      return record;
    },

    async getChat(id) {
      return chats.get(id);
    },

    async listChats() {
      return [...chats.values()].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
    },

    async deleteChat(id) {
      const existed = chats.delete(id);
      messages.delete(id);
      return existed;
    },

    async listMessages(chatId) {
      return [...(messages.get(chatId) ?? [])];
    },

    async appendMessage(input) {
      const record: ChatMessageRecord = {
        id: newId(),
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        citations: input.citations ?? [],
        createdAt: new Date(),
      };
      const thread = messages.get(input.chatId) ?? [];
      thread.push(record);
      messages.set(input.chatId, thread);
      return record;
    },

    async getMembershipSnapshot() {
      return { sourceVideos: sourceVideoLinks, collectionSources };
    },

    async countReadyVideosInScope(scope: Scope) {
      const videoIds = videoIdsForScope(scope, {
        sourceVideos: sourceVideoLinks,
        collectionSources,
      });
      let ready = 0;
      for (const videoId of videoIds) {
        if (readyVideoIds.has(videoId)) {
          ready += 1;
        }
      }
      return ready;
    },

    async hybridSearch(input) {
      const queryTokens = new Set(tokenize(input.queryText));
      const allowed = new Set(input.videoIds);
      const scored: Array<{ chunk: RetrievedChunk; score: number }> = [];

      for (const chunk of chunkIndex.values()) {
        if (!allowed.has(chunk.videoId)) {
          continue;
        }
        const chunkTokens = tokenize(chunk.content);
        const overlap = chunkTokens.filter((token) => queryTokens.has(token)).length;
        scored.push({ chunk, score: overlap });
      }

      return scored
        .sort((left, right) => right.score - left.score)
        .slice(0, input.poolSize)
        .map((row) => row.chunk);
    },

    async getChunksByIds(ids) {
      return ids
        .map((id) => chunkIndex.get(id))
        .filter((chunk): chunk is RetrievedChunk => chunk !== undefined);
    },

    async listChunksForVideos(videoIds) {
      const allowed = new Set(videoIds);
      return [...chunkIndex.values()].filter((chunk) =>
        allowed.has(chunk.videoId),
      );
    },
  };
}
