import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore, sourceIngestionStatus } from "@aulus/db";
import type { TranscriptSegment } from "@aulus/db";
import { handleIngestSource } from "../src/ingest/ingest-source";
import { handleIngestVideo } from "../src/ingest/ingest-video";
import type { TranscriptFetchResult } from "../src/ingest/transcript-fetcher";

const EMBEDDING_DIM = 1536;

function fakeEmbeddings() {
  return {
    model: "text-embedding-3-small",
    embedDocuments: async (texts: string[]) =>
      texts.map(() => Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === 0 ? 1 : 0))),
  };
}

const captionSegments: TranscriptSegment[] = [
  { text: "Hello world one.", startMs: 0, durationMs: 1000 },
  { text: "Hello world two.", startMs: 1000, durationMs: 1000 },
  { text: "Hello world three.", startMs: 2000, durationMs: 1000 },
];

async function seedAndFanOut() {
  const store = createMemoryIngestStore();
  const source = await store.createSource({
    kind: "video",
    youtubeId: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  const parent = await store.createJob({
    kind: "ingest_source",
    sourceId: source.id,
  });
  const childIds: string[] = [];
  await handleIngestSource(
    {
      store,
      enqueueJob: async (kind, jobId) => {
        if (kind === "ingest_video") {
          childIds.push(jobId);
        }
      },
    },
    parent.id,
  );
  return { store, source, parent, childJobId: childIds[0]! };
}

describe("handleIngestVideo", () => {
  test("stores a Transcript and prefixed Chunks and marks the Source ready", async () => {
    const { store, source, parent, childJobId } = await seedAndFanOut();

    await handleIngestVideo(
      {
        store,
        embeddings: fakeEmbeddings(),
        fetchTranscript: async (): Promise<TranscriptFetchResult> => ({
          ok: true,
          segments: captionSegments,
          isAsr: false,
          language: "en",
          metadata: {
            title: "Never Gonna Give You Up",
            description: null,
            durationSec: 213,
            chapters: [],
            thumbnails: {},
            channelYoutubeId: null,
          },
        }),
      },
      childJobId,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos[0]!.status).toBe("ready");
    expect(sourceIngestionStatus(videos.map((v) => v.status)).status).toBe(
      "ready",
    );

    const transcript = await store.getTranscript(videos[0]!.id);
    expect(transcript?.segments).toEqual(captionSegments);

    const chunks = await store.listChunks(videos[0]!.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.embedding).toHaveLength(EMBEDDING_DIM);
    expect(chunks[0]!.content.startsWith("Never Gonna Give You Up · ")).toBe(
      true,
    );
    expect(chunks[0]!.embeddingModel).toBe("text-embedding-3-small");

    const parentJob = await store.getJob(parent.id);
    expect(parentJob?.status).toBe("succeeded");
    expect(parentJob?.progress.ready).toBe(1);
  });

  test("marks a Video error and fails the Job when embedding throws", async () => {
    const { store, source, parent, childJobId } = await seedAndFanOut();

    await handleIngestVideo(
      {
        store,
        embeddings: {
          model: "text-embedding-3-small",
          embedDocuments: async () => {
            throw new Error("OpenAI down");
          },
        },
        fetchTranscript: async (): Promise<TranscriptFetchResult> => ({
          ok: true,
          segments: captionSegments,
          isAsr: false,
          language: "en",
          metadata: {
            title: "Never Gonna Give You Up",
            description: null,
            durationSec: 213,
            chapters: [],
            thumbnails: {},
            channelYoutubeId: null,
          },
        }),
      },
      childJobId,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos[0]!.status).toBe("error");
    const child = await store.getJob(childJobId);
    expect(child?.status).toBe("failed");
    const parentJob = await store.getJob(parent.id);
    expect(parentJob?.status).toBe("succeeded");
    expect(parentJob?.progress.error).toBe(1);
  });

  test("marks a caption-less Video unavailable without failing the parent Job", async () => {
    const { store, source, parent, childJobId } = await seedAndFanOut();

    await handleIngestVideo(
      {
        store,
        embeddings: fakeEmbeddings(),
        fetchTranscript: async (): Promise<TranscriptFetchResult> => ({
          ok: false,
          reason: "no_captions",
          message: "No captions",
        }),
      },
      childJobId,
    );

    const videos = await store.listVideosForSource(source.id);
    expect(videos[0]!.status).toBe("unavailable");
    expect(sourceIngestionStatus(videos.map((v) => v.status)).status).toBe(
      "unavailable",
    );

    const parentJob = await store.getJob(parent.id);
    expect(parentJob?.status).toBe("succeeded");
    expect(parentJob?.progress.unavailable).toBe(1);
  });
});
