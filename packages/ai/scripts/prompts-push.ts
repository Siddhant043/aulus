import { Client } from "langsmith";
import {
  PROMPT_NAMES,
  hubSlugForPrompt,
  localPromptCatalog,
} from "../src/prompt-catalog";

const apiKey = process.env.LANGSMITH_API_KEY;
if (!apiKey) {
  console.error("LANGSMITH_API_KEY is required to push prompts");
  process.exit(1);
}

const client = new Client({
  apiKey,
  apiUrl: process.env.LANGSMITH_ENDPOINT,
});

for (const name of PROMPT_NAMES) {
  const identifier = hubSlugForPrompt(name).replace(/:production$/, "");
  const url = await client.pushPrompt(identifier, {
    object: localPromptCatalog[name],
    tags: ["production"],
    isPublic: false,
  });
  console.log(`pushed ${name} → ${url}`);
}
