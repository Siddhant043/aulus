import { ChatPromptTemplate } from "@langchain/core/prompts";

export const chatGradePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Grade whether a Chunk is useful for answering the question.
Return JSON {{"relevant":true}} or {{"relevant":false}}.
Judge only the Chunk text; do not invent facts.`,
  ],
  [
    "human",
    "Prior turns:\n{history}\n\nQuestion:\n{question}\n\nChunk:\n{chunk}",
  ],
]);
