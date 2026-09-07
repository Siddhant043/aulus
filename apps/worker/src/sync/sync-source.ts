import type { IngestStore } from "@aulus/db";
import { diffSourceVideos } from "@aulus/db";
import type { EnumerateCollection } from "../ingest/ingest-source";
import { maybeEnqueueSyncRegen } from "./maybe-enqueue-sync-regen";
import type { EnqueueJob } from "./types";

export type SyncSourceDeps = {
  store: IngestStore;
  enqueueJob: EnqueueJob;
  enumerateCollection?: EnumerateCollection;
};

/**
 * sync_source Job: re-enumerate a collection-type Source and diff against its
 * source_videos. New Videos ingest; upstream-removed Videos are tombstoned
 * (shared Video/Chunks kept). On completion last_synced_at updates and, once
 * the new Videos finish ingesting, a fresh skill-content version is appended
 * when any became ready (via the regen barrier).
 */
export async function handleSyncSource(
  deps: SyncSourceDeps,
  jobId: string,
): Promise<void> {
  const job = await deps.store.getJob(jobId);
  if (!job || !job.sourceId) {
    throw new Error(`sync_source job ${jobId} is missing a Source`);
  }
  await deps.store.updateJob(jobId, { status: "running" });

  const source = await deps.store.getSource(job.sourceId);
  if (!source) {
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message: "Source not found" },
    });
    return;
  }
  if (source.kind === "video") {
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message: "video-kind Sources are immutable and never Synced" },
    });
    return;
  }

  try {
    if (!deps.enumerateCollection) {
      throw new Error(
        "YOUTUBE_API_KEY is required to Sync channel and playlist Sources",
      );
    }
    const enumerated = await deps.enumerateCollection({
      kind: source.kind,
      youtubeId: source.youtubeId,
    });
    const titleByYoutubeId = new Map(
      enumerated.map((video) => [video.youtubeVideoId, video.title]),
    );

    const links = await deps.store.listSourceVideoLinks(source.id);
    const diff = diffSourceVideos(
      links,
      enumerated.map((video) => video.youtubeVideoId),
    );

    for (const videoId of diff.reappearedVideoIds) {
      await deps.store.setSourceVideoRemoved(source.id, videoId, null);
    }
    const now = new Date();
    for (const videoId of diff.removedVideoIds) {
      await deps.store.setSourceVideoRemoved(source.id, videoId, now);
    }

    const newVideoIds: string[] = [];
    for (const youtubeVideoId of diff.newYoutubeIds) {
      const video = await deps.store.upsertVideo({
        youtubeVideoId,
        title: titleByYoutubeId.get(youtubeVideoId),
      });
      await deps.store.ensureSourceVideo(source.id, video.id);
      newVideoIds.push(video.id);

      if (video.status === "discovered" || video.status === "error") {
        await deps.store.updateVideo(video.id, {
          status: "pending_transcript",
        });
        const child = await deps.store.createJob({
          kind: "ingest_video",
          sourceId: source.id,
          videoId: video.id,
        });
        await deps.enqueueJob("ingest_video", child.id);
      }
    }

    await deps.store.updateSourceSyncState(source.id, { lastSyncedAt: now });

    await deps.store.updateJob(jobId, {
      status: "succeeded",
      progress: {
        ...(job.progress as Record<string, unknown>),
        phase: "done",
        counts: {
          new: diff.newYoutubeIds.length,
          removed: diff.removedVideoIds.length,
          reappeared: diff.reappearedVideoIds.length,
        },
        // The barrier reads this to decide conditional regen. A no-op Sync
        // leaves it empty, so it never regenerates.
        newVideoIds,
      },
    });

    // Fire the barrier now in case a new Video was already terminal (e.g. a
    // shared Video that is already ready); otherwise it fires from the
    // ingest_video completions.
    if (newVideoIds.length > 0) {
      await maybeEnqueueSyncRegen(deps.store, deps.enqueueJob, source.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message },
    });
  }
}
