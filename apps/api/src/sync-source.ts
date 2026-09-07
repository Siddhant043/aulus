import type { SourceRoutesDeps } from "./create-source";

const MANUAL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type SyncSourceResult =
  | { ok: false; status: 404 | 400 | 409; error: string }
  | { ok: true; jobId: string };

/**
 * Manual Sync trigger. Rejects video-kind Sources (immutable), an already
 * in-progress Sync, and manual re-triggers within a rolling 24h. Otherwise
 * enqueues a sync_source Job and stamps last_manual_sync_at.
 */
export async function enqueueSourceSync(
  deps: SourceRoutesDeps,
  sourceId: string,
  now: Date = new Date(),
): Promise<SyncSourceResult> {
  const source = await deps.store.getSource(sourceId);
  if (!source) {
    return { ok: false, status: 404, error: "Source not found" };
  }
  if (source.kind === "video") {
    return {
      ok: false,
      status: 400,
      error: "video-kind Sources are immutable and never Synced",
    };
  }

  const active = await deps.store.findActiveSyncSourceJob(sourceId);
  if (active) {
    return {
      ok: false,
      status: 409,
      error: "A Sync is already in progress for this Source",
    };
  }

  // Atomically claim the 24h manual-Sync slot so two concurrent requests can't
  // both pass the rate-limit check (TOCTOU).
  const claimed = await deps.store.tryClaimManualSync(
    sourceId,
    now,
    MANUAL_SYNC_INTERVAL_MS,
  );
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: "Manual Sync is limited to once per 24 hours",
    };
  }

  const job = await deps.store.createJob({
    kind: "sync_source",
    sourceId,
    progress: { phase: "queued", trigger: "manual" },
  });
  await deps.enqueueJob("sync_source", job.id);
  return { ok: true, jobId: job.id };
}
