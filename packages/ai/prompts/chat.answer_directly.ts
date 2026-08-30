import { ChatPromptTemplate } from "@langchain/core/prompts";

export const chatAnswerDirectlyPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Answer this greeting or meta question briefly. Do not retrieve, and do not emit Citations or [[chunk:...]] markers.`,
  ],
  ["human", "{question}"],
]);
