import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore } from "@aulus/db";
import { handleIngestSource } from "../src/ingest/ingest-source";

async function seedVideoSource() {
  const store = createMemoryIngestStore();
  const source = await store.createSource({
    kind: "video",
    youtubeId: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  const job = await store.createJob({
    kind: "ingest_source",
    sourceId: source.id,
  });
  return { store, source, job };
}

describe("handleIngestSource", () => {
  test("fans out one ingest_video Job for a video-kind Source", async () => {
    const { store, source, job } = await seedVideoSource();
    const enqueued: Array<{ kind: string; jobId: string }> = [];

    await handleIngestSource(
      {
        store,
        enqueueJob: async (kind, jobId) => {
          enqueued.push({ kind, jobId });
        },
      },
      job.id,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos).toHaveLength(1);
    expect(videos[0]!.youtubeVideoId).toBe("dQw4w9WgXcQ");
    expect(videos[0]!.status).toBe("pending_transcript");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.kind).toBe("ingest_video");

    const parent = await store.getJob(job.id);
    expect(parent?.status).toBe("running");
    expect(parent?.progress).toEqual({
      discovered: 1,
      ready: 0,
      unavailable: 0,
      error: 0,
    });
  });

  test("fans out one ingest_video Job per enumerated playlist Video", async () => {
    const store = createMemoryIngestStore();
    const source = await store.createSource({
      kind: "playlist",
      youtubeId: "PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
      url: "https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
    });
    const job = await store.createJob({
      kind: "ingest_source",
      sourceId: source.id,
    });
    const enqueued: Array<{ kind: string; jobId: string }> = [];

    await handleIngestSource(
      {
        store,
        enqueueJob: async (kind, jobId) => {
          enqueued.push({ kind, jobId });
        },
        enumerateCollection: async (input) => {
          expect(input).toEqual({
            kind: "playlist",
            youtubeId: "PLrAXtmRdnEQy6nuLMOVlrhdc6TjiSD4mG",
          });
          return [
            { youtubeVideoId: "aaaaaaaaaaa", title: "First" },
            { youtubeVideoId: "bbbbbbbbbbb", title: "Second" },
          ];
        },
      },
      job.id,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos.map((video) => video.youtubeVideoId).sort()).toEqual([
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
    ]);
    expect(videos.every((video) => video.status === "pending_transcript")).toBe(
      true,
    );
    expect(enqueued).toHaveLength(2);
    expect(enqueued.every((item) => item.kind === "ingest_video")).toBe(true);

    const parent = await store.getJob(job.id);
    expect(parent?.status).toBe("running");
    expect(parent?.progress).toEqual({
      discovered: 2,
      ready: 0,
      unavailable: 0,
      error: 0,
    });
  });

  test("fans out one ingest_video Job per enumerated channel Video", async () => {
    const store = createMemoryIngestStore();
    const source = await store.createSource({
      kind: "channel",
      youtubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      url: "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    });
    const job = await store.createJob({
      kind: "ingest_source",
      sourceId: source.id,
    });
    const enqueued: string[] = [];

    await handleIngestSource(
      {
        store,
        enqueueJob: async (kind, jobId) => {
          if (kind === "ingest_video") {
            enqueued.push(jobId);
          }
        },
        enumerateCollection: async (input) => {
          expect(input.kind).toBe("channel");
          expect(input.youtubeId).toBe("UC_x5XG1OV2P6uZZ5FSM9Ttw");
          return [{ youtubeVideoId: "ccccccccccc", title: "Upload" }];
        },
      },
      job.id,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos).toHaveLength(1);
    expect(videos[0]!.youtubeVideoId).toBe("ccccccccccc");
    expect(enqueued).toHaveLength(1);

    const parent = await store.getJob(job.id);
    expect(parent?.progress).toEqual({
      discovered: 1,
      ready: 0,
      unavailable: 0,
      error: 0,
    });
  });

  test("stores a shared Video once when a second Source enumerates it", async () => {
    const store = createMemoryIngestStore();
    const existing = await store.upsertVideo({
      youtubeVideoId: "sharedvide1",
      title: "Already ingested",
      status: "ready",
    });
    await store.saveTranscript({
      videoId: existing.id,
      language: "en",
      isAsr: false,
      segments: [{ text: "Hello", startMs: 0, durationMs: 1000 }],
      normalizedSegments: [{ text: "Hello", startMs: 0, durationMs: 1000 }],
    });
    await store.replaceChunks(existing.id, [
      {
        chunkIndex: 0,
        content: "Hello",
        startSec: 0,
        endSec: 1,
        citeStartSec: 0,
        citeEndSec: 1,
        chapterTitle: null,
        tokenCount: 1,
        embedding: null,
        chunkingVersion: "r3-v1",
        embeddingModel: "text-embedding-3-small",
      },
    ]);

    const source = await store.createSource({
      kind: "playlist",
      youtubeId: "PLshared",
      url: "https://www.youtube.com/playlist?list=PLshared",
    });
    const job = await store.createJob({
      kind: "ingest_source",
      sourceId: source.id,
    });
    const enqueuedYoutubeIds: string[] = [];

    await handleIngestSource(
      {
        store,
        enqueueJob: async (kind, jobId) => {
          if (kind !== "ingest_video") {
            return;
          }
          const child = await store.getJob(jobId);
          const video = child?.videoId
            ? await store.getVideo(child.videoId)
            : undefined;
          if (video) {
            enqueuedYoutubeIds.push(video.youtubeVideoId);
          }
        },
        enumerateCollection: async () => [
          { youtubeVideoId: "sharedvide1", title: "Already ingested" },
          { youtubeVideoId: "newvideo111", title: "New" },
        ],
      },
      job.id,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos).toHaveLength(2);
    const shared = videos.find(
      (video) => video.youtubeVideoId === "sharedvide1",
    );
    expect(shared?.id).toBe(existing.id);
    expect(shared?.status).toBe("ready");
    expect(enqueuedYoutubeIds).toEqual(["newvideo111"]);
    expect(await store.getTranscript(existing.id)).toBeDefined();
    expect(await store.listChunks(existing.id)).toHaveLength(1);
  });

  test("does not re-enqueue a shared Video that is already in flight or unavailable", async () => {
    const store = createMemoryIngestStore();
    const pending = await store.upsertVideo({
      youtubeVideoId: "inflight111",
      status: "pending_transcript",
    });
    const unavailable = await store.upsertVideo({
      youtubeVideoId: "nocaptions1",
      status: "unavailable",
    });

    const source = await store.createSource({
      kind: "playlist",
      youtubeId: "PLskip",
      url: "https://www.youtube.com/playlist?list=PLskip",
    });
    const job = await store.createJob({
      kind: "ingest_source",
      sourceId: source.id,
    });
    const enqueued: string[] = [];

    await handleIngestSource(
      {
        store,
        enqueueJob: async (kind, jobId) => {
          if (kind === "ingest_video") {
            enqueued.push(jobId);
          }
        },
        enumerateCollection: async () => [
          { youtubeVideoId: pending.youtubeVideoId, title: "In flight" },
          { youtubeVideoId: unavailable.youtubeVideoId, title: "Silent" },
        ],
      },
      job.id,
    );

    expect(enqueued).toEqual([]);
    const videos = await store.listVideosForSource(source.id);
    expect(videos.map((video) => video.id).sort()).toEqual(
      [pending.id, unavailable.id].sort(),
    );
  });
});
