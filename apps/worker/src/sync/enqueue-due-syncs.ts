import type { IngestStore } from "@aulus/db";
import type { EnqueueJob } from "./types";

/**
 * Enqueues a sync_source Job for every collection-type Source that has no Sync
 * already queued or running. Runs from the daily 03:00 UTC cron. Returns how
 * many Jobs were enqueued.
 */
export async function enqueueDueSyncs(
  store: IngestStore,
  enqueueJob: EnqueueJob,
): Promise<number> {
  const sources = await store.listCollectionTypeSources();
  let enqueued = 0;
  for (const source of sources) {
    const active = await store.findActiveSyncSourceJob(source.id);
    if (active) {
      continue;
    }
    const job = await store.createJob({
      kind: "sync_source",
      sourceId: source.id,
      progress: { phase: "queued", trigger: "auto" },
    });
    await enqueueJob("sync_source", job.id);
    enqueued += 1;
  }
  return enqueued;
}
