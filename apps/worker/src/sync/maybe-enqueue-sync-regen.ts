import type { IngestStore } from "@aulus/db";
import type { EnqueueJob } from "./types";

const TERMINAL_STATUSES = new Set(["ready", "unavailable", "error"]);

/**
 * Conditional-regen barrier for Sync. When every new Video a Sync pulled in has
 * finished ingesting, decides once whether to append a fresh skill-content
 * version: enqueue generate_skill_content (Scope = Source) only if ≥1 became
 * ready. Called after each ingest_video settles and at the end of the Sync Job
 * itself (to cover new Videos that were already ready, e.g. shared ones).
 */
export async function maybeEnqueueSyncRegen(
  store: IngestStore,
  enqueueJob: EnqueueJob,
  sourceId: string,
): Promise<void> {
  const syncJob = await store.findRegenPendingSyncSourceJob(sourceId);
  if (!syncJob) {
    return;
  }
  const progress = { ...(syncJob.progress as Record<string, unknown>) };
  const newVideoIds = (progress.newVideoIds as string[] | undefined) ?? [];

  const videos = await Promise.all(
    newVideoIds.map((videoId) => store.getVideo(videoId)),
  );
  // Wait until every still-existing new Video has reached a terminal state.
  const stillIngesting = videos.some(
    (video) => video !== undefined && !TERMINAL_STATUSES.has(video.status),
  );
  if (stillIngesting) {
    return;
  }

  // Atomically claim the decision so concurrent ingest_video completions
  // (default INGEST_VIDEO_CONCURRENCY is 2) can't both enqueue a regen.
  const won = await store.claimSyncSourceRegen(syncJob.id);
  if (!won) {
    return;
  }

  const newReady = videos.filter((video) => video?.status === "ready").length;
  await store.updateJob(syncJob.id, {
    progress: { ...progress, regenSettled: true, newReady },
  });

  if (newReady > 0) {
    const regenJob = await store.createJob({
      kind: "generate_skill_content",
      sourceId,
      progress: {
        scope: { kind: "source", sourceId },
        focus: "",
        phase: "queued",
      },
    });
    await enqueueJob("generate_skill_content", regenJob.id);
  }
}
