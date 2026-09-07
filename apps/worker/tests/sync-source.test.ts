import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore, type IngestStore } from "@aulus/db";
import type { EnumeratedVideo } from "../src/ingest/ingest-source";
import { handleSyncSource } from "../src/sync/sync-source";
import { maybeEnqueueSyncRegen } from "../src/sync/maybe-enqueue-sync-regen";
import { enqueueDueSyncs } from "../src/sync/enqueue-due-syncs";

type Enqueued = { kind: string; jobId: string };

function recorder() {
  const enqueued: Enqueued[] = [];
  return {
    enqueued,
    enqueueJob: async (kind: string, jobId: string) => {
      enqueued.push({ kind, jobId });
    },
  };
}

async function channelSource(store: IngestStore) {
  return store.createSource({
    kind: "channel",
    youtubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    url: "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
  });
}

function enumerator(byId: Record<string, EnumeratedVideo[]>) {
  return async (input: { kind: string; youtubeId: string }) =>
    byId[input.youtubeId] ?? [];
}

describe("handleSyncSource", () => {
  test("pulls in new Videos and enqueues ingest_video for them", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await channelSource(store);
    // Pre-existing Video already on the Source.
    const existing = await store.upsertVideo({
      youtubeVideoId: "old00000001",
      status: "ready",
    });
    await store.ensureSourceVideo(source.id, existing.id);

    const job = await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: { phase: "queued" },
    });

    await handleSyncSource(
      {
        store,
        enqueueJob: rec.enqueueJob,
        enumerateCollection: enumerator({
          [source.youtubeId]: [
            { youtubeVideoId: "old00000001", title: null },
            { youtubeVideoId: "new00000002", title: "New" },
          ],
        }),
      },
      job.id,
    );

    const finished = await store.getJob(job.id);
    expect(finished?.status).toBe("succeeded");
    expect((finished?.progress as { counts: { new: number } }).counts.new).toBe(
      1,
    );
    expect(rec.enqueued.map((e) => e.kind)).toContain("ingest_video");
    // last_synced_at recorded.
    expect((await store.getSource(source.id))?.lastSyncedAt).toBeInstanceOf(
      Date,
    );
  });

  test("tombstones upstream-removed Videos, keeping the shared Video", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await channelSource(store);
    const gone = await store.upsertVideo({
      youtubeVideoId: "gone0000001",
      status: "ready",
    });
    await store.ensureSourceVideo(source.id, gone.id);

    const job = await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: {},
    });
    await handleSyncSource(
      {
        store,
        enqueueJob: rec.enqueueJob,
        enumerateCollection: enumerator({ [source.youtubeId]: [] }),
      },
      job.id,
    );

    const links = await store.listSourceVideoLinks(source.id);
    expect(links[0]?.removedFromUpstreamAt).toBeInstanceOf(Date);
    // Shared Video itself is preserved.
    expect(await store.getVideo(gone.id)).toBeDefined();
  });

  test("video-kind Sources are never Synced", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await store.createSource({
      kind: "video",
      youtubeId: "dQw4w9WgXcQ",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const job = await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: {},
    });
    await handleSyncSource(
      { store, enqueueJob: rec.enqueueJob, enumerateCollection: enumerator({}) },
      job.id,
    );
    expect((await store.getJob(job.id))?.status).toBe("failed");
  });

  test("a no-op Sync appends no skill-content regen", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await channelSource(store);
    const kept = await store.upsertVideo({
      youtubeVideoId: "kept0000001",
      status: "ready",
    });
    await store.ensureSourceVideo(source.id, kept.id);

    const job = await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: {},
    });
    await handleSyncSource(
      {
        store,
        enqueueJob: rec.enqueueJob,
        enumerateCollection: enumerator({
          [source.youtubeId]: [{ youtubeVideoId: "kept0000001", title: null }],
        }),
      },
      job.id,
    );
    expect(
      rec.enqueued.some((e) => e.kind === "generate_skill_content"),
    ).toBe(false);
  });
});

describe("maybeEnqueueSyncRegen (barrier)", () => {
  test("enqueues generate_skill_content once every new Video is ready", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await channelSource(store);
    const v1 = await store.upsertVideo({
      youtubeVideoId: "aaa0000001",
      status: "pending_transcript",
    });
    await store.ensureSourceVideo(source.id, v1.id);
    await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: { newVideoIds: [v1.id] },
    });

    // Still ingesting → no regen yet.
    await maybeEnqueueSyncRegen(store, rec.enqueueJob, source.id);
    expect(rec.enqueued).toHaveLength(0);

    // Becomes ready → regen fires once.
    await store.updateVideo(v1.id, { status: "ready" });
    await maybeEnqueueSyncRegen(store, rec.enqueueJob, source.id);
    await maybeEnqueueSyncRegen(store, rec.enqueueJob, source.id); // idempotent
    expect(
      rec.enqueued.filter((e) => e.kind === "generate_skill_content"),
    ).toHaveLength(1);
  });

  test("no regen when every new Video ended up unavailable", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const source = await channelSource(store);
    const v1 = await store.upsertVideo({
      youtubeVideoId: "bbb0000001",
      status: "unavailable",
    });
    await store.ensureSourceVideo(source.id, v1.id);
    await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: { newVideoIds: [v1.id] },
    });

    await maybeEnqueueSyncRegen(store, rec.enqueueJob, source.id);
    expect(rec.enqueued).toHaveLength(0);
  });
});

describe("enqueueDueSyncs (cron)", () => {
  test("enqueues one Sync per collection-type Source, skipping active ones", async () => {
    const store = createMemoryIngestStore();
    const rec = recorder();
    const channel = await channelSource(store);
    const playlist = await store.createSource({
      kind: "playlist",
      youtubeId: "PL123",
      url: "https://youtube.com/playlist?list=PL123",
    });
    await store.createSource({
      kind: "video",
      youtubeId: "vid",
      url: "https://youtu.be/vid",
    });
    // channel already has a running Sync → skipped.
    await store.createJob({ kind: "sync_source", sourceId: channel.id });

    const count = await enqueueDueSyncs(store, rec.enqueueJob);
    expect(count).toBe(1);
    expect(rec.enqueued).toHaveLength(1);
    const enqueuedJob = await store.getJob(rec.enqueued[0]!.jobId);
    expect(enqueuedJob?.sourceId).toBe(playlist.id);
  });
});
