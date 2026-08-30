import { loadConfig } from "@aulus/config";
import { createApp } from "./app";

const config = loadConfig();
const app = createApp();

Bun.serve({
  hostname: "0.0.0.0",
  port: config.APP_PORT,
  fetch: app.fetch,
});

console.log(`api listening on ${config.APP_PORT}`);
