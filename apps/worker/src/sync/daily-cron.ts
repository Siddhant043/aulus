import type { IngestStore } from "@aulus/db";
import { enqueueDueSyncs } from "./enqueue-due-syncs";
import type { EnqueueJob } from "./types";

export const SYNC_CRON_HOUR_UTC = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds from `now` until the next occurrence of `hourUtc:00` UTC. */
export function msUntilNextUtcHour(now: Date, hourUtc: number): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hourUtc,
      0,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * In-worker daily cron: at 03:00 UTC, enqueue a Sync for every collection-type
 * Source (skipping any already running). Assumes a single worker replica —
 * with multiple replicas each would fire, though the per-Source active-Sync
 * guard bounds duplicates to a wasteful no-op re-enumeration.
 */
export function startDailySyncCron(
  store: IngestStore,
  enqueueJob: EnqueueJob,
): void {
  const run = async () => {
    try {
      const count = await enqueueDueSyncs(store, enqueueJob);
      console.log(`daily sync cron enqueued ${count} sync_source job(s)`);
    } catch (error) {
      console.error("daily sync cron failed", error);
    }
  };
  setTimeout(() => {
    void run();
    setInterval(() => void run(), DAY_MS);
  }, msUntilNextUtcHour(new Date(), SYNC_CRON_HOUR_UTC));
}
