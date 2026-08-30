import { ChatPromptTemplate } from "@langchain/core/prompts";

export const skillSynthesizePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Write the synthesized Skill content half for this topic, aimed at an agent that will author a SKILL.md.
Cite with [[chunk:<id>]] using only provided Chunk ids. This is not a finished SKILL.md.`,
  ],
  [
    "human",
    "Topic: {topic}\nFocus: {focus}\n\nChunks:\n{context}",
  ],
]);
