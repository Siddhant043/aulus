import { ChatPromptTemplate } from "@langchain/core/prompts";

export const skillPlanPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Plan skill-content topics for this Scope. Return JSON {{"topics":[...]}}, at most 5 topics, merged and prioritized.
An empty focus means a general skill-oriented digest.`,
  ],
  ["human", "Focus prompt:\n{focus}\n\nScope summary:\n{scope_summary}"],
]);
