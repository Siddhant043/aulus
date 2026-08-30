import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { JobKind } from "@aulus/db";

export const INGEST_SOURCE_QUEUE = "ingest_source";
export const GENERATE_SKILL_CONTENT_QUEUE = "generate_skill_content";

export type QueueJobData = { jobId: string };

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

export function createIngestSourceQueue(connection: IORedis) {
  return new Queue<QueueJobData>(INGEST_SOURCE_QUEUE, { connection });
}

export function createGenerateSkillContentQueue(connection: IORedis) {
  return new Queue<QueueJobData>(GENERATE_SKILL_CONTENT_QUEUE, {
    connection,
  });
}

export function enqueueApiJobs(queues: {
  ingestSource: Queue<QueueJobData>;
  generateSkillContent: Queue<QueueJobData>;
}): (kind: JobKind, jobId: string) => Promise<void> {
  return async (kind, jobId) => {
    if (kind === "ingest_source") {
      await queues.ingestSource.add(kind, { jobId });
      return;
    }
    if (kind === "generate_skill_content") {
      await queues.generateSkillContent.add(kind, { jobId });
      return;
    }
    throw new Error(`api cannot enqueue job kind ${kind}`);
  };
}
