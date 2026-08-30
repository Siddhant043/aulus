import type { Chat, ChatMessage, ChatScope } from "@aulus/types";
import type { ChatMessageRecord, ChatRecord } from "@aulus/db";

export function toChatScope(record: ChatRecord): ChatScope {
  switch (record.scopeKind) {
    case "library":
      return { kind: "library" };
    case "source":
      return { kind: "source", sourceId: record.sourceId! };
    case "collection":
      return { kind: "collection", collectionId: record.collectionId! };
  }
}

export function toChatDto(record: ChatRecord): Chat {
  return {
    id: record.id,
    scope: toChatScope(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toChatMessageDto(record: ChatMessageRecord): ChatMessage {
  return {
    id: record.id,
    chatId: record.chatId,
    role: record.role,
    content: record.content,
    citations: record.citations,
    createdAt: record.createdAt.toISOString(),
  };
}
