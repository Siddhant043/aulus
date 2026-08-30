import { describe, expect, test } from "bun:test";
import { Document } from "@langchain/core/documents";
import { loadConfig } from "@aulus/config";
import { initProviders } from "../src/index";

const validEnv = {
  DATABASE_URL: "postgres://aulus:aulus@localhost:5432/aulus",
  REDIS_URL: "redis://localhost:6379",
  OPENAI_API_KEY: "sk-test",
  LLM_PROVIDER: "openai",
  LLM_MODEL: "gpt-4o-mini",
};

async function providersFor(
  env: Record<string, string | undefined> = {},
  options?: Parameters<typeof initProviders>[1],
) {
  return initProviders(loadConfig({ ...validEnv, ...env }), {
    checkOllamaReachable: async () => true,
    ...options,
  });
}

describe("initProviders", () => {
  test("returns OpenAI embeddings fixed to text-embedding-3-small", async () => {
    const providers = await providersFor();
    expect(providers.embeddings.model).toBe("text-embedding-3-small");
  });

  test("returns chat and fast chat models as runnables", async () => {
    const providers = await providersFor();
    expect(typeof providers.chatModel.invoke).toBe("function");
    expect(typeof providers.fastChatModel.invoke).toBe("function");
    expect(typeof providers.chatModel.stream).toBe("function");
  });

  test("none reranker keeps document order", async () => {
    const providers = await providersFor({ RERANKER: "none" });
    const first = new Document({ pageContent: "alpha", id: "a" });
    const second = new Document({ pageContent: "beta", id: "b" });
    const reranked = await providers.reranker.compressDocuments(
      [first, second],
      "query",
    );
    expect(reranked.map((document) => document.id)).toEqual(["a", "b"]);
  });

  test("fails in production when primary LLM is ollama and it is unreachable", async () => {
    await expect(
      providersFor(
        { LLM_PROVIDER: "ollama", NODE_ENV: "production" },
        { checkOllamaReachable: async () => false },
      ),
    ).rejects.toThrow(/Ollama is not reachable/);
  });

  test("warns in development when ollama is unreachable instead of aborting", async () => {
    const providers = await providersFor(
      { LLM_PROVIDER: "ollama", NODE_ENV: "development" },
      { checkOllamaReachable: async () => false },
    );
    expect(providers.chatModel).toBeDefined();
  });

  test("still returns a streaming chat model when a fallback provider is set", async () => {
    const providers = await providersFor({
      LLM_PROVIDER: "openai",
      LLM_FALLBACK_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(typeof providers.chatModel.invoke).toBe("function");
    expect(typeof providers.chatModel.stream).toBe("function");
  });
});
