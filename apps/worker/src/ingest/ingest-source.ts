import type { IngestStore, JobKind } from "@aulus/db";
import { sourceIngestionStatus } from "@aulus/db";

export type EnqueueJob = (kind: JobKind, jobId: string) => Promise<void>;

export type IngestSourceDeps = {
  store: IngestStore;
  enqueueJob: EnqueueJob;
};

export async function refreshSourceJobProgress(
  store: IngestStore,
  sourceId: string,
  jobId: string,
): Promise<void> {
  const videos = await store.listVideosForSource(sourceId);
  const snapshot = sourceIngestionStatus(videos.map((video) => video.status));
  const finished = videos.length > 0 && snapshot.progress.discovered === 0;
  await store.updateJob(jobId, {
    progress: snapshot.progress,
    status: finished ? "succeeded" : "running",
  });
}

export async function refreshActiveParentJob(
  store: IngestStore,
  sourceId: string,
): Promise<void> {
  const parent = await store.findActiveIngestSourceJob(sourceId);
  if (parent) {
    await refreshSourceJobProgress(store, sourceId, parent.id);
  }
}

export async function handleIngestSource(
  deps: IngestSourceDeps,
  jobId: string,
): Promise<void> {
  const job = await deps.store.getJob(jobId);
  if (!job || !job.sourceId) {
    throw new Error(`ingest_source job ${jobId} is missing a Source`);
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

  if (source.kind !== "video") {
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message: `ingest_source for ${source.kind} Sources is not implemented` },
    });
    return;
  }

  const video = await deps.store.upsertVideo({
    youtubeVideoId: source.youtubeId,
  });
  await deps.store.ensureSourceVideo(source.id, video.id);

  if (video.status === "ready") {
    await refreshSourceJobProgress(deps.store, source.id, jobId);
    return;
  }

  if (video.status !== "pending_transcript") {
    await deps.store.updateVideo(video.id, { status: "pending_transcript" });
  }

  const child = await deps.store.createJob({
    kind: "ingest_video",
    sourceId: source.id,
    videoId: video.id,
  });
  await deps.enqueueJob("ingest_video", child.id);
  await refreshSourceJobProgress(deps.store, source.id, jobId);
}
