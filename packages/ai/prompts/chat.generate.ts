import { ChatPromptTemplate } from "@langchain/core/prompts";

export const chatGeneratePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Answer using only the retrieved Chunks. Cite a claim with [[chunk:<id>]] using ids from the context — never invent ids or timestamps.
If the Chunks do not contain the answer, say so. Write display markdown.`,
  ],
  [
    "human",
    "Prior turns:\n{history}\n\nQuestion:\n{question}\n\nChunks:\n{context}",
  ],
]);
