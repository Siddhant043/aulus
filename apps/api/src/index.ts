import { loadConfig } from "@aulus/config";
import { initProviders } from "@aulus/ai";
import { createDb, createDrizzleIngestStore } from "@aulus/db";
import { createApp } from "./app";
import {
  createIngestSourceQueue,
  createRedisConnection,
  enqueueIngestSource,
} from "./queue";

const config = loadConfig();
await initProviders(config);

const store = createDrizzleIngestStore(createDb(config.DATABASE_URL));
const redis = createRedisConnection(config.REDIS_URL);
const ingestSourceQueue = createIngestSourceQueue(redis);
const app = createApp({
  store,
  enqueueJob: enqueueIngestSource(ingestSourceQueue),
});

Bun.serve({
  hostname: "0.0.0.0",
  port: config.APP_PORT,
  fetch: app.fetch,
});

console.log(`api listening on ${config.APP_PORT}`);
