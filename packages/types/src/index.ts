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

export {
  parseYoutubeUrl,
  YoutubeUrlError,
} from "./youtube-url";
export type { ParsedYoutubeUrl } from "./youtube-url";

export const sourceIngestionStatusSchema = z.enum([
  "ingesting",
  "ready",
  "unavailable",
  "error",
]);
export type SourceIngestionStatus = z.infer<typeof sourceIngestionStatusSchema>;

export const ingestProgressSchema = z.object({
  discovered: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
});
export type IngestProgress = z.infer<typeof ingestProgressSchema>;

export const createSourceRequestSchema = z.object({
  url: z.string().min(1),
});
export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>;

export const sourceSchema = z.object({
  id: z.string().uuid(),
  kind: sourceKindSchema,
  youtubeId: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  status: sourceIngestionStatusSchema,
  jobId: z.string().uuid().nullable(),
  progress: ingestProgressSchema,
});
export type Source = z.infer<typeof sourceSchema>;

export const sourceListResponseSchema = z.array(sourceSchema);
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;
