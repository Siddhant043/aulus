import { describe, expect, test } from "bun:test";
import { createMemoryChatStore, createMemoryIngestStore } from "@aulus/db";
import { chatSchema } from "@aulus/types";
import { createApp } from "../src/app";
import { resetChatLocksForTests } from "../src/chat-in-flight";
import { createTestProviders } from "./test-providers";

const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const videoId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";

function createTestApp() {
  const ingestStore = createMemoryIngestStore();
  const chatStore = createMemoryChatStore({
    sourceVideos: [{ sourceId, videoId }],
    readyVideoIds: new Set([videoId]),
    chunks: [
      {
        id: chunkId,
        videoId,
        youtubeVideoId: "abc123",
        chunkIndex: 0,
        content: "Rust ownership transfers at compile time",
        citeStartSec: 12,
        citeEndSec: 48,
        chapterTitle: "Ownership",
      },
    ],
  });

  const providers = createTestProviders({
    route: '{"route":"retrieve"}',
    grade: '{"relevant":true}',
    generate: `Ownership is enforced [[chunk:${chunkId}]]`,
  });

  return createApp({
    store: ingestStore,
    chatStore,
    providers,
    enqueueJob: async () => {},
  });
}

describe("POST /api/chats", () => {
  test("creates a Chat with a fixed Source scope", async () => {
    const app = createTestApp();
    const response = await app.request("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "source", sourceId }),
    });

    expect(response.status).toBe(201);
    const body = chatSchema.parse(await response.json());
    expect(body.scope).toEqual({ kind: "source", sourceId });
  });
});

describe("POST /api/chats/:id/messages", () => {
  test("streams status, token, citations, and done over SSE", async () => {
    resetChatLocksForTests();
    const app = createTestApp();
    const created = await app.request("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "source", sourceId }),
    });
    const chat = chatSchema.parse(await created.json());

    const response = await app.request(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "How does ownership work?" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await response.text();
    expect(text).toContain("event: status");
    expect(text).toContain("event: token");
    expect(text).toContain("event: citations");
    expect(text).toContain("event: done");
    expect(text).toContain('"youtubeVideoId":"abc123"');
    expect(text).toContain('"citeStartSec":12');
  });

  test("returns 400 when the Scope has no ready Videos", async () => {
    resetChatLocksForTests();
    const chatStore = createMemoryChatStore({
      sourceVideos: [{ sourceId, videoId }],
      readyVideoIds: new Set(),
    });
    const app = createApp({
      store: createMemoryIngestStore(),
      chatStore,
      providers: createTestProviders({}),
      enqueueJob: async () => {},
    });
    const created = await app.request("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "source", sourceId }),
    });
    const chat = chatSchema.parse(await created.json());

    const response = await app.request(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello?" }),
    });

    expect(response.status).toBe(400);
  });

  test("returns 409 for concurrent in-flight sends", async () => {
    resetChatLocksForTests();
    const chatStore = createMemoryChatStore({
      sourceVideos: [{ sourceId, videoId }],
      readyVideoIds: new Set([videoId]),
      chunks: [
        {
          id: chunkId,
          videoId,
          youtubeVideoId: "abc123",
          chunkIndex: 0,
          content: "Rust ownership transfers at compile time",
          citeStartSec: 12,
          citeEndSec: 48,
          chapterTitle: "Ownership",
        },
      ],
    });

    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const providers = createTestProviders({
      route: '{"route":"answer_directly"}',
      answerDirectly: async () => {
        await gate;
        return "Hi there";
      },
    });

    const app = createApp({
      store: createMemoryIngestStore(),
      chatStore,
      providers,
      enqueueJob: async () => {},
    });
    const created = await app.request("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "source", sourceId }),
    });
    const chat = chatSchema.parse(await created.json());

    const first = app.request(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hi" }),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await app.request(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Again" }),
    });
    expect(second.status).toBe(409);

    releaseFirst?.();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
  });
});
