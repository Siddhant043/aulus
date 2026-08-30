import { loadConfig } from "@aulus/config";
import { initProviders } from "@aulus/ai";
import {
  createDb,
  createDrizzleChatStore,
  createDrizzleIngestStore,
  createDrizzleSkillContentStore,
} from "@aulus/db";
import { createApp } from "./app";
import {
  createGenerateSkillContentQueue,
  createIngestSourceQueue,
  createRedisConnection,
  enqueueApiJobs,
} from "./queue";

const config = loadConfig();
const providers = await initProviders(config);

const db = createDb(config.DATABASE_URL);
const store = createDrizzleIngestStore(db);
const chatStore = createDrizzleChatStore(db);
const skillContentStore = createDrizzleSkillContentStore(db);
const redis = createRedisConnection(config.REDIS_URL);
const ingestSourceQueue = createIngestSourceQueue(redis);
const generateSkillContentQueue = createGenerateSkillContentQueue(redis);
const app = createApp({
  store,
  enqueueJob: enqueueApiJobs({
    ingestSource: ingestSourceQueue,
    generateSkillContent: generateSkillContentQueue,
  }),
  chatStore,
  skillContentStore,
  providers,
});

Bun.serve({
  hostname: "0.0.0.0",
  port: config.APP_PORT,
  fetch: app.fetch,
});

console.log(`api listening on ${config.APP_PORT}`);
