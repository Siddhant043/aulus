import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/index";

const validEnv = {
  DATABASE_URL: "postgres://aulus:aulus@localhost:5432/aulus",
  REDIS_URL: "redis://localhost:6379",
  OPENAI_API_KEY: "sk-test",
  LLM_PROVIDER: "ollama",
};

describe("loadConfig", () => {
  test("fails fast with a clear message when a required var is missing", () => {
    expect(() => loadConfig({ ...validEnv, OPENAI_API_KEY: undefined })).toThrow(
      /OPENAI_API_KEY/,
    );
  });

  test("fails fast when a required var is empty", () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: "" })).toThrow(
      /DATABASE_URL/,
    );
  });

  test("returns typed config when required env is present", () => {
    const config = loadConfig(validEnv);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.REDIS_URL).toBe(validEnv.REDIS_URL);
    expect(config.OPENAI_API_KEY).toBe("sk-test");
    expect(config.LLM_PROVIDER).toBe("ollama");
    expect(config.RERANKER).toBe("none");
  });

  test("rejects an unknown LLM provider", () => {
    expect(() => loadConfig({ ...validEnv, LLM_PROVIDER: "gemini" })).toThrow(
      /LLM_PROVIDER/,
    );
  });

  test("fails when RERANKER=cohere and COHERE_API_KEY is missing", () => {
    expect(() => loadConfig({ ...validEnv, RERANKER: "cohere" })).toThrow(
      /COHERE_API_KEY/,
    );
  });

  test("fails when an LLM provider is anthropic and ANTHROPIC_API_KEY is missing", () => {
    expect(() =>
      loadConfig({ ...validEnv, LLM_PROVIDER: "anthropic" }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  test("treats empty optional vars as unset", () => {
    const config = loadConfig({
      ...validEnv,
      YOUTUBE_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      LANGSMITH_API_KEY: "",
      LLM_FALLBACK_PROVIDER: "",
    });
    expect(config.YOUTUBE_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.LANGSMITH_API_KEY).toBeUndefined();
    expect(config.LLM_FALLBACK_PROVIDER).toBeUndefined();
  });
});
