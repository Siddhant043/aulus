import type {
  IngestStore,
  JobKind,
  SourceRecord,
  VideoStatusValue,
} from "@aulus/db";
import { sourceIngestionStatus } from "@aulus/db";

export type EnqueueJob = (kind: JobKind, jobId: string) => Promise<void>;

export type EnumeratedVideo = {
  youtubeVideoId: string;
  title: string | null;
};

export type EnumerateCollection = (input: {
  kind: "channel" | "playlist";
  youtubeId: string;
}) => Promise<EnumeratedVideo[]>;

export type IngestSourceDeps = {
  store: IngestStore;
  enqueueJob: EnqueueJob;
  enumerateCollection?: EnumerateCollection;
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

async function videosForSource(
  source: SourceRecord,
  enumerateCollection: EnumerateCollection | undefined,
): Promise<EnumeratedVideo[]> {
  if (source.kind === "video") {
    return [{ youtubeVideoId: source.youtubeId, title: null }];
  }
  if (!enumerateCollection) {
    throw new Error(
      "YOUTUBE_API_KEY is required to ingest channel and playlist Sources",
    );
  }
  return enumerateCollection({
    kind: source.kind,
    youtubeId: source.youtubeId,
  });
}

function shouldEnqueueTranscriptJob(status: VideoStatusValue): boolean {
  return status === "discovered" || status === "error";
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

  try {
    const enumerated = await videosForSource(
      source,
      deps.enumerateCollection,
    );
    for (const item of enumerated) {
      const video = await deps.store.upsertVideo({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title ?? undefined,
      });
      await deps.store.ensureSourceVideo(source.id, video.id);

      if (!shouldEnqueueTranscriptJob(video.status)) {
        continue;
      }

      await deps.store.updateVideo(video.id, { status: "pending_transcript" });

      const child = await deps.store.createJob({
        kind: "ingest_video",
        sourceId: source.id,
        videoId: video.id,
      });
      await deps.enqueueJob("ingest_video", child.id);
    }
    await refreshSourceJobProgress(deps.store, source.id, jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message },
    });
  }
}
