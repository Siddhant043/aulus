import { loadConfig } from "@aulus/config";
import { initProviders } from "../src/index";

const config = loadConfig();
const providers = await initProviders(config);

const embedding = await providers.embeddings.embedQuery(
  "Aulus smoke: embed one sentence.",
);
if (embedding.length !== 1536) {
  throw new Error(`expected 1536-dim embedding, got ${embedding.length}`);
}

const reply = await providers.chatModel.invoke("Reply with the single word ok.");
console.log("chat:", reply);
console.log(`embed dim: ${embedding.length}`);
console.log("smoke ok");
