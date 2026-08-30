import { Worker } from "bullmq";
import { loadConfig } from "@aulus/config";
import { initProviders } from "@aulus/ai";
import {
  createDb,
  createDrizzleChatStore,
  createDrizzleIngestStore,
  createDrizzleSkillContentStore,
} from "@aulus/db";
import { createTranscriptFetcher } from "./ingest/create-transcript-fetcher";
import { handleIngestSource } from "./ingest/ingest-source";
import { handleIngestVideo } from "./ingest/ingest-video";
import { createYoutubeDataApiEnumerator } from "./ingest/youtube-data-api";
import { handleGenerateSkillContent } from "./skill/generate-skill-content";
import {
  createIngestQueues,
  createRedisConnection,
  enqueueUsing,
  GENERATE_SKILL_CONTENT_QUEUE,
  INGEST_SOURCE_QUEUE,
  INGEST_VIDEO_QUEUE,
  type IngestJobData,
} from "./queue";

const config = loadConfig();
const providers = await initProviders(config);
const db = createDb(config.DATABASE_URL);
const store = createDrizzleIngestStore(db);
const chatStore = createDrizzleChatStore(db);
const skillContentStore = createDrizzleSkillContentStore(db);
const redis = createRedisConnection(config.REDIS_URL);
const queues = createIngestQueues(redis);
const enqueueJob = enqueueUsing(queues);
const fetchTranscript = createTranscriptFetcher();
const enumerateCollection = config.YOUTUBE_API_KEY
  ? createYoutubeDataApiEnumerator({ apiKey: config.YOUTUBE_API_KEY })
  : undefined;

const ingestSourceWorker = new Worker<IngestJobData>(
  INGEST_SOURCE_QUEUE,
  async (job) => {
    await handleIngestSource(
      { store, enqueueJob, enumerateCollection },
      job.data.jobId,
    );
  },
  { connection: redis.duplicate() },
);

const ingestVideoWorker = new Worker<IngestJobData>(
  INGEST_VIDEO_QUEUE,
  async (job) => {
    await handleIngestVideo(
      {
        store,
        fetchTranscript,
        embeddings: {
          model: providers.embeddings.model,
          embedDocuments: (texts) =>
            providers.embeddings.embedDocuments(texts),
        },
      },
      job.data.jobId,
    );
  },
  {
    connection: redis.duplicate(),
    concurrency: config.INGEST_VIDEO_CONCURRENCY,
  },
);

const generateSkillContentWorker = new Worker<IngestJobData>(
  GENERATE_SKILL_CONTENT_QUEUE,
  async (job) => {
    await handleGenerateSkillContent(
      {
        ingestStore: store,
        chatStore,
        skillContentStore,
        providers,
      },
      job.data.jobId,
    );
  },
  { connection: redis.duplicate() },
);

ingestSourceWorker.on("failed", (job, error) => {
  console.error(`ingest_source ${job?.id} failed`, error);
});
ingestVideoWorker.on("failed", (job, error) => {
  console.error(`ingest_video ${job?.id} failed`, error);
});
generateSkillContentWorker.on("failed", (job, error) => {
  console.error(`generate_skill_content ${job?.id} failed`, error);
});

console.log(
  `worker ready (redis ${config.REDIS_URL}, llm ${config.LLM_PROVIDER})`,
);
