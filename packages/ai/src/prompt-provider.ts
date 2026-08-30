import type { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  hubSlugForPrompt,
  isPromptName,
  localPromptCatalog,
} from "./prompt-catalog";

export type PullHubPrompt = (
  hubSlug: string,
) => Promise<ChatPromptTemplate>;

export class PromptProvider {
  constructor(private readonly pullHubPrompt?: PullHubPrompt) {}

  async get(name: string): Promise<ChatPromptTemplate> {
    if (!isPromptName(name)) {
      throw new Error(`Unknown prompt: ${name}`);
    }
    const local = localPromptCatalog[name];
    if (!this.pullHubPrompt) {
      return local;
    }
    try {
      return await this.pullHubPrompt(hubSlugForPrompt(name));
    } catch {
      return local;
    }
  }
}
