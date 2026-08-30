import type { Providers } from "@aulus/ai";
import { runChatTurn } from "@aulus/ai";
import {
  scopeFromChatRecord,
  videoIdsForScope,
  type ChatStore,
} from "@aulus/db";
import type { SendChatMessageRequest } from "@aulus/types";
import { tryAcquireChatLock, releaseChatLock } from "./chat-in-flight";

export type ChatRoutesDeps = {
  store: ChatStore;
  providers: Providers;
};

const HISTORY_TURN_LIMIT = 10;

export async function sendChatMessage(
  deps: ChatRoutesDeps,
  chatId: string,
  body: SendChatMessageRequest,
): Promise<
  | { ok: false; status: 404 | 400 | 409; error: string }
  | {
      ok: true;
      events: AsyncGenerator<{ event: string; data: string }>;
    }
> {
  const chat = await deps.store.getChat(chatId);
  if (!chat) {
    return { ok: false, status: 404, error: "Chat not found" };
  }

  const scope = scopeFromChatRecord(chat);
  const readyCount = await deps.store.countReadyVideosInScope(scope);
  if (readyCount === 0) {
    return {
      ok: false,
      status: 400,
      error: "Scope has no ready Videos",
    };
  }

  if (!tryAcquireChatLock(chatId)) {
    return {
      ok: false,
      status: 409,
      error: "A message is already being answered for this Chat",
    };
  }

  const membership = await deps.store.getMembershipSnapshot();
  const videoIds = [...videoIdsForScope(scope, membership)];
  const history = (await deps.store.listMessages(chatId))
    .slice(-HISTORY_TURN_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  await deps.store.appendMessage({
    chatId,
    role: "user",
    content: body.content,
  });

  async function* events(): AsyncGenerator<{ event: string; data: string }> {
    try {
      let displayMarkdown = "";
      let citations: Array<{
        videoId: string;
        youtubeVideoId: string;
        citeStartSec: number;
        citeEndSec: number;
        chunkId?: string;
      }> = [];

      for await (const event of runChatTurn(
        { providers: deps.providers, store: deps.store },
        {
          question: body.content,
          history,
          videoIds,
        },
      )) {
        switch (event.type) {
          case "status":
            yield {
              event: "status",
              data: JSON.stringify({ phase: event.phase }),
            };
            break;
          case "token":
            yield {
              event: "token",
              data: JSON.stringify({ text: event.text }),
            };
            break;
          case "citations":
            citations = event.citations;
            yield {
              event: "citations",
              data: JSON.stringify({ citations: event.citations }),
            };
            break;
          case "done":
            displayMarkdown = event.displayMarkdown;
            await deps.store.appendMessage({
              chatId,
              role: "assistant",
              content: displayMarkdown,
              citations,
            });
            yield { event: "done", data: "{}" };
            break;
          case "error":
            yield {
              event: "error",
              data: JSON.stringify({ message: event.message }),
            };
            break;
        }
      }
    } finally {
      releaseChatLock(chatId);
    }
  }

  return { ok: true, events: events() };
}
