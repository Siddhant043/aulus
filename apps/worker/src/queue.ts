import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { JobKind } from "@aulus/db";

export const INGEST_SOURCE_QUEUE = "ingest_source";
export const INGEST_VIDEO_QUEUE = "ingest_video";

export type IngestJobData = { jobId: string };

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export function createIngestQueues(connection: IORedis) {
  const ingestSource = new Queue<IngestJobData>(INGEST_SOURCE_QUEUE, {
    connection,
  });
  const ingestVideo = new Queue<IngestJobData>(INGEST_VIDEO_QUEUE, {
    connection,
  });
  return { ingestSource, ingestVideo };
}

export function enqueueUsing(
  queues: ReturnType<typeof createIngestQueues>,
): (kind: JobKind, jobId: string) => Promise<void> {
  return async (kind, jobId) => {
    const queue =
      kind === "ingest_source" ? queues.ingestSource : queues.ingestVideo;
    await queue.add(kind, { jobId });
  };
}
