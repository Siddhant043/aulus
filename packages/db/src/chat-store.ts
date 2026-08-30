import type { ChatScope, ScopeKind } from "@aulus/types";
import type { CitationRef } from "./schema";
import type { MembershipSnapshot, Scope } from "./domain/video-ids-for-scope";

export type ChatRecord = {
  id: string;
  scopeKind: ScopeKind;
  sourceId: string | null;
  collectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageRecord = {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: CitationRef[];
  createdAt: Date;
};

export type RetrievedChunk = {
  id: string;
  videoId: string;
  youtubeVideoId: string;
  chunkIndex: number;
  content: string;
  citeStartSec: number;
  citeEndSec: number;
  chapterTitle: string | null;
};

export function scopeFromChatRecord(chat: ChatRecord): Scope {
  switch (chat.scopeKind) {
    case "library":
      return { kind: "library" };
    case "source":
      return { kind: "source", sourceId: chat.sourceId! };
    case "collection":
      return { kind: "collection", collectionId: chat.collectionId! };
  }
}

export function scopeFromChatScope(scope: ChatScope): Scope {
  switch (scope.kind) {
    case "library":
      return { kind: "library" };
    case "source":
      return { kind: "source", sourceId: scope.sourceId };
    case "collection":
      return { kind: "collection", collectionId: scope.collectionId };
  }
}

export type ChatStore = {
  createChat(scope: ChatScope): Promise<ChatRecord>;
  getChat(id: string): Promise<ChatRecord | undefined>;
  listChats(): Promise<ChatRecord[]>;
  deleteChat(id: string): Promise<boolean>;
  listMessages(chatId: string): Promise<ChatMessageRecord[]>;
  appendMessage(input: {
    chatId: string;
    role: ChatMessageRecord["role"];
    content: string;
    citations?: CitationRef[];
  }): Promise<ChatMessageRecord>;
  getMembershipSnapshot(): Promise<MembershipSnapshot>;
  countReadyVideosInScope(scope: Scope): Promise<number>;
  hybridSearch(input: {
    queryText: string;
    queryEmbedding: number[];
    videoIds: readonly string[];
    poolSize: number;
  }): Promise<RetrievedChunk[]>;
  getChunksByIds(ids: readonly string[]): Promise<RetrievedChunk[]>;
  listChunksForVideos(videoIds: readonly string[]): Promise<RetrievedChunk[]>;
};
