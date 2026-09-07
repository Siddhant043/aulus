import {
  chatListResponseSchema,
  chatSchema,
  chatSseCitationsEventSchema,
  chatSseErrorEventSchema,
  chatSseStatusEventSchema,
  chatSseTokenEventSchema,
  chatWithMessagesSchema,
  collectionListResponseSchema,
  sourceListResponseSchema,
  sourceSchema,
  type Chat,
  type ChatScope,
  type ChatWithMessages,
  type CitationRef,
  type Collection,
  type Source,
} from "@aulus/types";
import { createSseParser } from "./sse";

/**
 * Thin fetch layer over the same-origin /api. Responses are validated with the
 * shared Zod schemas so the UI and the Hono API can never silently drift.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

export async function listSources(signal?: AbortSignal): Promise<Source[]> {
  const response = await fetch("/api/sources", { signal });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return sourceListResponseSchema.parse(await response.json());
}

export async function createSource(url: string): Promise<Source> {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return sourceSchema.parse(await response.json());
}

export async function listCollections(
  signal?: AbortSignal,
): Promise<Collection[]> {
  const response = await fetch("/api/collections", { signal });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return collectionListResponseSchema.parse(await response.json());
}

export async function listChats(signal?: AbortSignal): Promise<Chat[]> {
  const response = await fetch("/api/chats", { signal });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return chatListResponseSchema.parse(await response.json());
}

export async function createChat(scope: ChatScope): Promise<Chat> {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scope),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return chatSchema.parse(await response.json());
}

export async function getChat(
  id: string,
  signal?: AbortSignal,
): Promise<ChatWithMessages> {
  const response = await fetch(`/api/chats/${id}`, { signal });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return chatWithMessagesSchema.parse(await response.json());
}

export async function deleteChat(id: string): Promise<void> {
  const response = await fetch(`/api/chats/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
}

// The stream ends when the response body closes, so the SSE `done` event needs
// no client handling — only the payload-bearing events are mapped.
export type ChatStreamEvent =
  | { type: "status"; phase: string }
  | { type: "token"; text: string }
  | { type: "citations"; citations: CitationRef[] }
  | { type: "error"; message: string };

/**
 * Sends a message and yields the SSE stream as typed events. A non-2xx (e.g.
 * 409 concurrent send, 400 empty Scope) throws ApiError before streaming.
 */
export async function* streamChatMessage(
  chatId: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await readError(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        const mapped = mapChatEvent(event.event, event.data);
        if (mapped) {
          yield mapped;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function mapChatEvent(event: string, data: string): ChatStreamEvent | null {
  const json = safeJson(data);
  switch (event) {
    case "status":
      return { type: "status", phase: chatSseStatusEventSchema.parse(json).phase };
    case "token":
      return { type: "token", text: chatSseTokenEventSchema.parse(json).text };
    case "citations":
      return {
        type: "citations",
        citations: chatSseCitationsEventSchema.parse(json).citations,
      };
    case "error":
      return {
        type: "error",
        message: chatSseErrorEventSchema.parse(json).message,
      };
    default:
      return null;
  }
}

function safeJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}
