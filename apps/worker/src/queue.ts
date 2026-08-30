import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { JobKind } from "@aulus/db";

export const INGEST_SOURCE_QUEUE = "ingest_source";
export const INGEST_VIDEO_QUEUE = "ingest_video";
export const GENERATE_SKILL_CONTENT_QUEUE = "generate_skill_content";

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
  const generateSkillContent = new Queue<IngestJobData>(
    GENERATE_SKILL_CONTENT_QUEUE,
    { connection },
  );
  return { ingestSource, ingestVideo, generateSkillContent };
}

export function enqueueUsing(
  queues: ReturnType<typeof createIngestQueues>,
): (kind: JobKind, jobId: string) => Promise<void> {
  return async (kind, jobId) => {
    if (kind === "ingest_source") {
      await queues.ingestSource.add(kind, { jobId });
      return;
    }
    if (kind === "ingest_video") {
      await queues.ingestVideo.add(kind, { jobId });
      return;
    }
    if (kind === "generate_skill_content") {
      await queues.generateSkillContent.add(kind, { jobId });
      return;
    }
    throw new Error(`worker cannot enqueue job kind ${kind}`);
  };
}
