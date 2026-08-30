import { ChatPromptTemplate } from "@langchain/core/prompts";

export const skillCriticPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Critique skill-content against this checklist: resolvable [[chunk:]] ids, R4-compliant suggested name/description, required sections, synthesized half within budget (~3k tokens / ~400 lines).
Return JSON {{"pass":true}} or {{"pass":false,"revised_markdown":"..."}}. Revise at most once.`,
  ],
  ["human", "{markdown}"],
]);
