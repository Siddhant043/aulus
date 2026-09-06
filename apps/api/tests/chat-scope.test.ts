import { describe, expect, test } from "bun:test";
import { createMemoryChatStore, createMemoryIngestStore } from "@aulus/db";
import { chatSchema } from "@aulus/types";
import { createApp } from "../src/app";
import { resetChatLocksForTests } from "../src/chat-in-flight";
import { createTestProviders } from "./test-providers";

const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const videoId = "11111111-1111-4111-8111-111111111111";
const memberSourceId = "22222222-2222-4222-8222-222222222222";
const outsiderSourceId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";

function appWithCollection() {
  const chatStore = createMemoryChatStore({
    sourceVideos: [{ sourceId: memberSourceId, videoId }],
    // Collection groups only the member Source, not the outsider.
    collectionSources: [{ collectionId, sourceId: memberSourceId }],
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
  return createApp({
    store: createMemoryIngestStore(),
    chatStore,
    providers: createTestProviders({
      route: '{"route":"retrieve"}',
      grade: '{"relevant":true}',
      generate: `Ownership is enforced [[chunk:${chunkId}]]`,
    }),
    enqueueJob: async () => {},
  });
}

async function startChat(
  app: ReturnType<typeof createApp>,
  scope: unknown,
): Promise<string> {
  const created = await app.request("/api/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scope),
  });
  return chatSchema.parse(await created.json()).id;
}

describe("Chat Scope = Collection / Library (AC2, AC3)", () => {
  test("a Collection-scoped Chat answers from the union of its Sources' Videos", async () => {
    resetChatLocksForTests();
    const app = appWithCollection();
    const chatId = await startChat(app, { kind: "collection", collectionId });

    const response = await app.request(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "How does ownership work?" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"youtubeVideoId":"abc123"');
  });

  test("a Library-scoped Chat answers from every Video", async () => {
    resetChatLocksForTests();
    const app = appWithCollection();
    const chatId = await startChat(app, { kind: "library" });

    const response = await app.request(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "How does ownership work?" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"youtubeVideoId":"abc123"');
  });

  test("a Chat scoped to a Source outside the Collection has no ready Videos", async () => {
    resetChatLocksForTests();
    const app = appWithCollection();
    const chatId = await startChat(app, {
      kind: "source",
      sourceId: outsiderSourceId,
    });

    const response = await app.request(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "anything" }),
    });
    expect(response.status).toBe(400);
  });
});
