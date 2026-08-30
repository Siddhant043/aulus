import { loadConfig } from "@aulus/config";
import { initProviders } from "@aulus/ai";

const config = loadConfig();
await initProviders(config);

console.log(
  `worker ready (redis ${config.REDIS_URL}, llm ${config.LLM_PROVIDER})`,
);

for (;;) {
  await Bun.sleep(60_000);
}
