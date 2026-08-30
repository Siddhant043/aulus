import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { chatAnswerDirectlyPrompt } from "../prompts/chat.answer_directly";
import { chatGeneratePrompt } from "../prompts/chat.generate";
import { chatGradePrompt } from "../prompts/chat.grade";
import { chatRewritePrompt } from "../prompts/chat.rewrite";
import { chatRoutePrompt } from "../prompts/chat.route";
import { skillCriticPrompt } from "../prompts/skill.critic";
import { skillPlanPrompt } from "../prompts/skill.plan";
import { skillSynthesizePrompt } from "../prompts/skill.synthesize";

export const PROMPT_NAMES = [
  "chat.route",
  "chat.grade",
  "chat.rewrite",
  "chat.generate",
  "chat.answer_directly",
  "skill.plan",
  "skill.synthesize",
  "skill.critic",
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];

export const localPromptCatalog: Record<PromptName, ChatPromptTemplate> = {
  "chat.route": chatRoutePrompt,
  "chat.grade": chatGradePrompt,
  "chat.rewrite": chatRewritePrompt,
  "chat.generate": chatGeneratePrompt,
  "chat.answer_directly": chatAnswerDirectlyPrompt,
  "skill.plan": skillPlanPrompt,
  "skill.synthesize": skillSynthesizePrompt,
  "skill.critic": skillCriticPrompt,
};

export function hubSlugForPrompt(name: PromptName): string {
  return `aulus/${name.replace(".", "-")}:production`;
}

export function isPromptName(name: string): name is PromptName {
  return (PROMPT_NAMES as readonly string[]).includes(name);
}
