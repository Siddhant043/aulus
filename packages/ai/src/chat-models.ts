import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AppConfig } from "@aulus/config";
import type { LlmProvider } from "@aulus/types";

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  ollama: "llama3.1",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

type ChatRole = "chat" | "fast";

export function defaultModelFor(provider: LlmProvider): string {
  return DEFAULT_MODEL[provider];
}

export function createChatModel(
  provider: LlmProvider,
  model: string | undefined,
  role: ChatRole,
  config: AppConfig,
): BaseChatModel {
  const resolvedModel = model ?? defaultModelFor(provider);
  const temperature = role === "chat" ? 0.2 : 0;
  const streaming = role === "chat";
  const maxRetries = 2;

  switch (provider) {
    case "openai":
      return new ChatOpenAI({
        model: resolvedModel,
        temperature,
        streaming,
        maxRetries,
        apiKey: config.OPENAI_API_KEY,
      });
    case "anthropic":
      return new ChatAnthropic({
        model: resolvedModel,
        temperature,
        streaming,
        maxRetries,
        apiKey: config.ANTHROPIC_API_KEY,
      });
    case "ollama":
      return new ChatOllama({
        model: resolvedModel,
        temperature,
        streaming,
        baseUrl: config.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      });
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported LLM provider: ${exhaustive}`);
    }
  }
}
