import { describe, expect, test } from "bun:test";
import {
  healthResponseSchema,
  llmProviderSchema,
  rerankerSchema,
  scopeKindSchema,
  sourceKindSchema,
} from "../src/index";

describe("shared domain schemas", () => {
  test("sourceKind accepts video, channel, and playlist only", () => {
    expect(sourceKindSchema.parse("video")).toBe("video");
    expect(sourceKindSchema.parse("channel")).toBe("channel");
    expect(sourceKindSchema.parse("playlist")).toBe("playlist");
    expect(sourceKindSchema.safeParse("livestream").success).toBe(false);
  });

  test("scopeKind accepts source, collection, and library only", () => {
    expect(scopeKindSchema.parse("source")).toBe("source");
    expect(scopeKindSchema.parse("collection")).toBe("collection");
    expect(scopeKindSchema.parse("library")).toBe("library");
    expect(scopeKindSchema.safeParse("video").success).toBe(false);
  });

  test("llmProvider accepts ollama, openai, and anthropic only", () => {
    expect(llmProviderSchema.parse("ollama")).toBe("ollama");
    expect(llmProviderSchema.safeParse("gemini").success).toBe(false);
  });

  test("reranker defaults to none and accepts cohere and voyage", () => {
    expect(rerankerSchema.parse("none")).toBe("none");
    expect(rerankerSchema.parse("cohere")).toBe("cohere");
    expect(rerankerSchema.parse("voyage")).toBe("voyage");
  });

  test("health response is { status: ok }", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({
      status: "ok",
    });
    expect(healthResponseSchema.safeParse({ status: "down" }).success).toBe(
      false,
    );
  });
});
