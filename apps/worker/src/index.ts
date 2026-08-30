import { loadConfig } from "@aulus/config";

const config = loadConfig();

console.log(
  `worker ready (redis ${config.REDIS_URL}, llm ${config.LLM_PROVIDER})`,
);

for (;;) {
  await Bun.sleep(60_000);
}
