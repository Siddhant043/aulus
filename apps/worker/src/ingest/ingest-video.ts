import {
  buildEmbedPrefix,
  CHUNKING_VERSION,
  normalizeCaptionText,
  packChunks,
  type IngestStore,
  type StoredChunk,
} from "@aulus/db";
import { refreshActiveParentJob } from "./ingest-source";
import type { TranscriptFetcher } from "./transcript-fetcher";

export const EMBED_BATCH_SIZE = 64;

export type EmbeddingsPort = {
  model: string;
  embedDocuments: (texts: string[]) => Promise<number[][]>;
};

export type IngestVideoDeps = {
  store: IngestStore;
  embeddings: EmbeddingsPort;
  fetchTranscript: TranscriptFetcher;
};

async function embedPrefixedBodies(
  embeddings: EmbeddingsPort,
  texts: string[],
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    const embedded = await embeddings.embedDocuments(batch);
    vectors.push(...embedded);
  }
  return vectors;
}

export async function handleIngestVideo(
  deps: IngestVideoDeps,
  jobId: string,
): Promise<void> {
  const job = await deps.store.getJob(jobId);
  if (!job || !job.videoId || !job.sourceId) {
    throw new Error(`ingest_video job ${jobId} is missing a Video`);
  }
  await deps.store.updateJob(jobId, { status: "running" });

  try {
    const video = await deps.store.getVideo(job.videoId);
    if (!video) {
      await deps.store.updateJob(jobId, {
        status: "failed",
        error: { message: "Video not found" },
      });
      return;
    }

    if (video.status === "ready") {
      await deps.store.updateJob(jobId, { status: "succeeded" });
      await refreshActiveParentJob(deps.store, job.sourceId);
      return;
    }

    const fetched = await deps.fetchTranscript(video.youtubeVideoId);

    if (fetched.metadata) {
      await deps.store.updateVideo(video.id, {
        title: fetched.metadata.title ?? video.title,
        description: fetched.metadata.description ?? video.description,
        durationSec: fetched.metadata.durationSec ?? video.durationSec,
        channelYoutubeId:
          fetched.metadata.channelYoutubeId ?? video.channelYoutubeId,
        chapters: fetched.metadata.chapters ?? video.chapters,
        thumbnails: fetched.metadata.thumbnails ?? video.thumbnails,
      });
    }

    if (!fetched.ok) {
      const status = fetched.reason === "no_captions" ? "unavailable" : "error";
      await deps.store.updateVideo(video.id, {
        status,
        lastIngestError: fetched.message,
      });
      await deps.store.updateJob(jobId, {
        status: "succeeded",
        error:
          fetched.reason === "error" ? { message: fetched.message } : null,
      });
      await refreshActiveParentJob(deps.store, job.sourceId);
      return;
    }

    const metadata = fetched.metadata;
    await deps.store.updateVideo(video.id, {
      title: metadata.title,
      description: metadata.description,
      durationSec: metadata.durationSec,
      channelYoutubeId: metadata.channelYoutubeId,
      chapters: metadata.chapters,
      thumbnails: metadata.thumbnails,
      status: "pending_transcript",
    });

    const normalizedSegments = fetched.segments.map((segment) => ({
      ...segment,
      text: normalizeCaptionText(segment.text),
    }));

    await deps.store.saveTranscript({
      videoId: video.id,
      language: fetched.language,
      isAsr: fetched.isAsr,
      segments: fetched.segments,
      normalizedSegments,
    });

    const packed = packChunks(normalizedSegments, metadata.chapters);
    const videoTitle = metadata.title;
    const prefixed = packed.map((chunk) =>
      buildEmbedPrefix({
        videoTitle,
        chapterTitle: chunk.chapterTitle,
        body: chunk.content,
      }),
    );
    const embeddings = await embedPrefixedBodies(deps.embeddings, prefixed);

    const stored: StoredChunk[] = packed.map((chunk, index) => ({
      ...chunk,
      content: prefixed[index]!,
      embedding: embeddings[index] ?? null,
      chunkingVersion: CHUNKING_VERSION,
      embeddingModel: deps.embeddings.model,
    }));

    await deps.store.replaceChunks(video.id, stored);
    await deps.store.updateVideo(video.id, {
      status: "ready",
      lastIngestError: null,
      ingestedAt: new Date(),
    });
    await deps.store.updateJob(jobId, { status: "succeeded" });
    await refreshActiveParentJob(deps.store, job.sourceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.store.updateVideo(job.videoId, {
      status: "error",
      lastIngestError: message,
    });
    await deps.store.updateJob(jobId, {
      status: "failed",
      error: { message },
    });
    await refreshActiveParentJob(deps.store, job.sourceId);
  }
}
