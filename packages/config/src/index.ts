import { z, ZodError } from "zod";
import { llmProviderSchema, rerankerSchema } from "@aulus/types";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "required"),
    REDIS_URL: z.string().min(1, "required"),
    OPENAI_API_KEY: z.string().min(1, "required"),
    LLM_PROVIDER: llmProviderSchema,
    LLM_MODEL: z.string().min(1).optional(),
    LLM_FALLBACK_PROVIDER: llmProviderSchema.optional(),
    LLM_FALLBACK_MODEL: z.string().min(1).optional(),
    FAST_LLM_PROVIDER: llmProviderSchema.optional(),
    FAST_LLM_MODEL: z.string().min(1).optional(),
    OLLAMA_BASE_URL: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    YOUTUBE_API_KEY: z.string().min(1).optional(),
    RERANKER: rerankerSchema.default("none"),
    COHERE_API_KEY: z.string().min(1).optional(),
    VOYAGE_API_KEY: z.string().min(1).optional(),
    LANGSMITH_TRACING: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((value) => value === "true" || value === "1"),
    LANGSMITH_API_KEY: z.string().min(1).optional(),
    LANGSMITH_PROJECT: z.string().min(1).optional(),
    LANGSMITH_ENDPOINT: z.string().min(1).optional(),
    APP_PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  })
  .superRefine((env, ctx) => {
    const providers = [
      env.LLM_PROVIDER,
      env.LLM_FALLBACK_PROVIDER,
      env.FAST_LLM_PROVIDER,
    ];
    if (providers.includes("anthropic") && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "required when an LLM provider is anthropic",
      });
    }
    if (env.RERANKER === "cohere" && !env.COHERE_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["COHERE_API_KEY"],
        message: "required when RERANKER=cohere",
      });
    }
    if (env.RERANKER === "voyage" && !env.VOYAGE_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["VOYAGE_API_KEY"],
        message: "required when RERANKER=voyage",
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function formatConfigError(error: ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `  ${path}: ${issue.message}`;
  });
  return `Invalid configuration:\n${lines.join("\n")}`;
}

function omitBlankEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    cleaned[key] = value === "" ? undefined : value;
  }
  return cleaned;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = envSchema.safeParse(omitBlankEnv(env));
  if (!result.success) {
    throw new ConfigError(formatConfigError(result.error));
  }
  return result.data;
}
