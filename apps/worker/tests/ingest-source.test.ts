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
});
