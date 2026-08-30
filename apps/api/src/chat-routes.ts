import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createChatRequestSchema,
  sendChatMessageRequestSchema,
} from "@aulus/types";
import type { ChatRoutesDeps } from "./send-chat-message";
import { sendChatMessage } from "./send-chat-message";
import { toChatDto, toChatMessageDto } from "./chat-dto";

export function registerChatRoutes(app: Hono, deps: ChatRoutesDeps): void {
  app.post("/api/chats", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = createChatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid Chat scope" }, 400);
    }

    const chat = await deps.store.createChat(parsed.data);
    return c.json(toChatDto(chat), 201);
  });

  app.get("/api/chats", async (c) => {
    const chats = await deps.store.listChats();
    return c.json(chats.map(toChatDto));
  });

  app.get("/api/chats/:id", async (c) => {
    const chat = await deps.store.getChat(c.req.param("id"));
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }
    const messages = await deps.store.listMessages(chat.id);
    return c.json({
      chat: toChatDto(chat),
      messages: messages.map(toChatMessageDto),
    });
  });

  app.delete("/api/chats/:id", async (c) => {
    const deleted = await deps.store.deleteChat(c.req.param("id"));
    if (!deleted) {
      return c.json({ error: "Chat not found" }, 404);
    }
    return c.body(null, 204);
  });

  app.post("/api/chats/:id/messages", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = sendChatMessageRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid message" }, 400);
    }

    const result = await sendChatMessage(deps, c.req.param("id"), parsed.data);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }

    return streamSSE(c, async (stream) => {
      for await (const event of result.events) {
        await stream.writeSSE(event);
      }
    });
  });
}
