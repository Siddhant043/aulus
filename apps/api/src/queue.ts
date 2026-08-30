import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { JobKind } from "@aulus/db";

export const INGEST_SOURCE_QUEUE = "ingest_source";

export type IngestJobData = { jobId: string };

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export function createIngestSourceQueue(connection: IORedis) {
  return new Queue<IngestJobData>(INGEST_SOURCE_QUEUE, { connection });
}

export function enqueueIngestSource(
  queue: Queue<IngestJobData>,
): (kind: JobKind, jobId: string) => Promise<void> {
  return async (kind, jobId) => {
    if (kind !== "ingest_source") {
      throw new Error(`api can only enqueue ingest_source, got ${kind}`);
    }
    await queue.add(kind, { jobId });
  };
}
