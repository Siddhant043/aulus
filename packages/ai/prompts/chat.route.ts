import { ChatPromptTemplate } from "@langchain/core/prompts";

export const chatRoutePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You route Chat questions.
Return JSON {{"route":"retrieve"}} to search the Library, or {{"route":"answer_directly"}} for greetings, meta questions, or small-talk that needs no Citations.
Never invent video timestamps.`,
  ],
  [
    "human",
    "Prior turns:\n{history}\n\nCurrent question:\n{question}",
  ],
]);
