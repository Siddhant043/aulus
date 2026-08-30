import { z } from "zod";

export const sourceKindSchema = z.enum(["video", "channel", "playlist"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const scopeKindSchema = z.enum(["source", "collection", "library"]);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

export const llmProviderSchema = z.enum(["ollama", "openai", "anthropic"]);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

export const rerankerSchema = z.enum(["none", "cohere", "voyage"]);
export type Reranker = z.infer<typeof rerankerSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
