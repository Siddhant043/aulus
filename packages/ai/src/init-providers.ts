import { CohereRerank } from "@langchain/cohere";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import type { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { Runnable } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { AppConfig } from "@aulus/config";
import { createChatModel } from "./chat-models";
import { PromptProvider, type PullHubPrompt } from "./prompt-provider";
import { NoneReranker } from "./rerank/none";
import { VoyageReranker } from "./rerank/voyage";
import { withRetryableFallbacks } from "./retryable-fallback";
import { applyTracingEnv } from "./tracing";

export type InitProvidersOptions = {
  checkOllamaReachable?: (baseUrl: string) => Promise<boolean>;
  pullHubPrompt?: PullHubPrompt;
};

export type Providers = {
  chatModel: Runnable;
  fastChatModel: Runnable;
  embeddings: OpenAIEmbeddings;
  reranker: BaseDocumentCompressor;
  prompts: PromptProvider;
};

const EMBEDDING_MODEL = "text-embedding-3-small";

async function defaultPullHubPrompt(slug: string): Promise<ChatPromptTemplate> {
  const hub = await import("langchain/hub");
  return (await hub.pull(slug)) as ChatPromptTemplate;
}

export async function checkOllamaReachable(
  baseUrl: string,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/tags", baseUrl), {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function withOptionalFallback(
  primary: Runnable,
  fallback: Runnable | undefined,
): Runnable {
  if (!fallback) {
    return primary;
  }
  return withRetryableFallbacks(primary, fallback);
}

function createReranker(config: AppConfig): BaseDocumentCompressor {
  switch (config.RERANKER) {
    case "none":
      return new NoneReranker();
    case "cohere":
      if (!config.COHERE_API_KEY) {
        throw new Error("COHERE_API_KEY is required when RERANKER=cohere");
      }
      return new CohereRerank({
        apiKey: config.COHERE_API_KEY,
        topN: 6,
      });
    case "voyage":
      if (!config.VOYAGE_API_KEY) {
        throw new Error("VOYAGE_API_KEY is required when RERANKER=voyage");
      }
      return new VoyageReranker(config.VOYAGE_API_KEY);
    default: {
      const exhaustive: never = config.RERANKER;
      throw new Error(`Unsupported reranker: ${exhaustive}`);
    }
  }
}

export async function initProviders(
  config: AppConfig,
  options: InitProvidersOptions = {},
): Promise<Providers> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embeddings");
  }

  applyTracingEnv(config);

  if (config.LLM_PROVIDER === "ollama") {
    const baseUrl = config.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    const ping = options.checkOllamaReachable ?? checkOllamaReachable;
    const reachable = await ping(baseUrl);
    if (!reachable) {
      const message = `Ollama is not reachable at ${baseUrl}`;
      if (config.NODE_ENV === "production") {
        throw new Error(message);
      }
      console.warn(message);
    }
  }

  const chatPrimary = createChatModel(
    config.LLM_PROVIDER,
    config.LLM_MODEL,
    "chat",
    config,
  );
  const chatFallback = config.LLM_FALLBACK_PROVIDER
    ? createChatModel(
        config.LLM_FALLBACK_PROVIDER,
        config.LLM_FALLBACK_MODEL,
        "chat",
        config,
      )
    : undefined;

  const fastProvider = config.FAST_LLM_PROVIDER ?? config.LLM_PROVIDER;
  const fastPrimary = createChatModel(
    fastProvider,
    config.FAST_LLM_MODEL,
    "fast",
    config,
  );

  return {
    chatModel: withOptionalFallback(chatPrimary, chatFallback),
    fastChatModel: fastPrimary,
    embeddings: new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      apiKey: config.OPENAI_API_KEY,
    }),
    reranker: createReranker(config),
    prompts: new PromptProvider(
      options.pullHubPrompt ??
        (config.LANGSMITH_API_KEY ? defaultPullHubPrompt : undefined),
    ),
  };
}
