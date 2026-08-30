import { ChatPromptTemplate } from "@langchain/core/prompts";

export const chatRewritePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Rewrite the question as a better retrieval query over YouTube transcript Chunks.
Return only the rewritten query. Keep the original intent.`,
  ],
  [
    "human",
    "Prior turns:\n{history}\n\nQuestion to rewrite:\n{question}",
  ],
]);
