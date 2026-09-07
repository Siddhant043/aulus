import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore, type IngestStore } from "@aulus/db";
import { createApp } from "../src/app";

function appWith(store: IngestStore) {
  const enqueued: Array<{ kind: string; jobId: string }> = [];
  const app = createApp({
    store,
    enqueueJob: async (kind, jobId) => {
      enqueued.push({ kind, jobId });
    },
  });
  return { app, enqueued };
}

async function channel(store: IngestStore) {
  return store.createSource({
    kind: "channel",
    youtubeId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    url: "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
  });
}

describe("POST /api/sources/:id/sync", () => {
  test("returns 202 + jobId and enqueues a sync_source Job", async () => {
    const store = createMemoryIngestStore();
    const { app, enqueued } = appWith(store);
    const source = await channel(store);

    const response = await app.request(`/api/sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();
    expect(enqueued).toEqual([{ kind: "sync_source", jobId: body.jobId }]);
    // last_manual_sync_at stamped.
    expect((await store.getSource(source.id))?.lastManualSyncAt).toBeInstanceOf(
      Date,
    );
  });

  test("404 for a missing Source", async () => {
    const store = createMemoryIngestStore();
    const { app } = appWith(store);
    const response = await app.request(
      "/api/sources/00000000-0000-0000-0000-000000000000/sync",
      { method: "POST" },
    );
    expect(response.status).toBe(404);
  });

  test("400 for a video-kind Source (never Synced)", async () => {
    const store = createMemoryIngestStore();
    const { app } = appWith(store);
    const source = await store.createSource({
      kind: "video",
      youtubeId: "dQw4w9WgXcQ",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const response = await app.request(`/api/sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(response.status).toBe(400);
  });

  test("409 when a manual Sync ran within the last 24h", async () => {
    const store = createMemoryIngestStore();
    const { app } = appWith(store);
    const source = await channel(store);

    const first = await app.request(`/api/sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(first.status).toBe(202);

    const second = await app.request(`/api/sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(second.status).toBe(409);
  });

  test("409 when a Sync is already in progress", async () => {
    const store = createMemoryIngestStore();
    const { app } = appWith(store);
    const source = await channel(store);
    // A queued sync_source Job exists but no manual-sync timestamp yet.
    await store.createJob({ kind: "sync_source", sourceId: source.id });

    const response = await app.request(`/api/sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(response.status).toBe(409);
  });
});
