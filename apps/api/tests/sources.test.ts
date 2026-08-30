import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore } from "@aulus/db";
import { sourceSchema } from "@aulus/types";
import { createApp } from "../src/app";

describe("POST /api/sources", () => {
  test("returns a video-kind Source for a YouTube video URL", async () => {
    const store = createMemoryIngestStore();
    const enqueued: Array<{ kind: string; jobId: string }> = [];
    const app = createApp({
      store,
      enqueueJob: async (kind, jobId) => {
        enqueued.push({ kind, jobId });
      },
    });

    const response = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
    });

    expect(response.status).toBe(201);
    const body = sourceSchema.parse(await response.json());
    expect(body.kind).toBe("video");
    expect(body.youtubeId).toBe("dQw4w9WgXcQ");
    expect(body.status).toBe("ingesting");
    expect(body.jobId).toBeTruthy();
    expect(enqueued).toEqual([
      { kind: "ingest_source", jobId: body.jobId as string },
    ]);
  });

  test("rejects a non-YouTube URL with 400", async () => {
    const app = createApp({
      store: createMemoryIngestStore(),
      enqueueJob: async () => {},
    });

    const response = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/watch?v=dQw4w9WgXcQ" }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects channel and playlist URLs until T6", async () => {
    const app = createApp({
      store: createMemoryIngestStore(),
      enqueueJob: async () => {},
    });

    const channel = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
      }),
    });
    expect(channel.status).toBe(400);
  });

  test("returns the existing Source when the same video URL is posted twice", async () => {
    const store = createMemoryIngestStore();
    const app = createApp({
      store,
      enqueueJob: async () => {},
    });
    const first = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    });
    const firstBody = sourceSchema.parse(await first.json());

    const second = await app.request("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    });

    expect(second.status).toBe(200);
    const secondBody = sourceSchema.parse(await second.json());
    expect(secondBody.id).toBe(firstBody.id);
  });
});
