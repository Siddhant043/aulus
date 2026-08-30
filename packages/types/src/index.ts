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
  url: z.string(),
  youtubeId: z.string(),
  title: z.string().nullable(),
  status: sourceIngestionStatusSchema,
  jobId: z.string().uuid().nullable(),
  progress: ingestProgressSchema,
});
export type Source = z.infer<typeof sourceSchema>;

export const sourceListResponseSchema = z.array(sourceSchema);
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;

export const chatScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library") }),
  z.object({ kind: z.literal("source"), sourceId: z.string().uuid() }),
  z.object({
    kind: z.literal("collection"),
    collectionId: z.string().uuid(),
  }),
]);
export type ChatScope = z.infer<typeof chatScopeSchema>;

export const createChatRequestSchema = chatScopeSchema;
export type CreateChatRequest = z.infer<typeof createChatRequestSchema>;

export const chatSchema = z.object({
  id: z.string().uuid(),
  scope: chatScopeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Chat = z.infer<typeof chatSchema>;

export const chatMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

export const citationRefSchema = z.object({
  videoId: z.string().uuid(),
  youtubeVideoId: z.string(),
  citeStartSec: z.number(),
  citeEndSec: z.number(),
  chunkId: z.string().uuid().optional(),
});
export type CitationRef = z.infer<typeof citationRefSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  role: chatMessageRoleSchema,
  content: z.string(),
  citations: z.array(citationRefSchema),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sendChatMessageRequestSchema = z.object({
  content: z.string().min(1),
});
export type SendChatMessageRequest = z.infer<
  typeof sendChatMessageRequestSchema
>;

export const chatSseStatusEventSchema = z.object({
  phase: z.string(),
});
export type ChatSseStatusEvent = z.infer<typeof chatSseStatusEventSchema>;

export const chatSseTokenEventSchema = z.object({
  text: z.string(),
});
export type ChatSseTokenEvent = z.infer<typeof chatSseTokenEventSchema>;

export const chatSseCitationsEventSchema = z.object({
  citations: z.array(citationRefSchema),
});
export type ChatSseCitationsEvent = z.infer<typeof chatSseCitationsEventSchema>;

export const chatSseErrorEventSchema = z.object({
  message: z.string(),
});
export type ChatSseErrorEvent = z.infer<typeof chatSseErrorEventSchema>;

export const generateSkillContentRequestSchema = z.object({
  scope: chatScopeSchema,
  focus: z.string().optional(),
});
export type GenerateSkillContentRequest = z.infer<
  typeof generateSkillContentRequestSchema
>;

export const generateSkillContentResponseSchema = z.object({
  jobId: z.string().uuid(),
});
export type GenerateSkillContentResponse = z.infer<
  typeof generateSkillContentResponseSchema
>;

export const skillContentArtifactSchema = z.object({
  id: z.string().uuid(),
  scope: chatScopeSchema,
  version: z.number().int().positive(),
  markdown: z.string(),
  bestPracticesTemplateVersion: z.string(),
  modelStamps: z.record(z.string(), z.string()),
  generatedAt: z.string().datetime(),
});
export type SkillContentArtifact = z.infer<typeof skillContentArtifactSchema>;

export const jobKindSchema = z.enum([
  "ingest_source",
  "ingest_video",
  "generate_skill_content",
]);
export type JobKindDto = z.infer<typeof jobKindSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatusDto = z.infer<typeof jobStatusSchema>;

export const jobSchema = z.object({
  id: z.string().uuid(),
  kind: jobKindSchema,
  status: jobStatusSchema,
  sourceId: z.string().uuid().nullable(),
  videoId: z.string().uuid().nullable(),
  progress: z.record(z.string(), z.unknown()),
  error: z.record(z.string(), z.unknown()).nullable(),
});
export type Job = z.infer<typeof jobSchema>;
