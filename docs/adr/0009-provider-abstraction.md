# Provider abstraction in @aulus/ai

AI backends live in `@aulus/ai` via `initProviders()`: chat + fast LLM
(ollama/openai/anthropic, primary.withFallbacks on retryable errors),
fixed OpenAI embeddings (1536-dim), pluggable reranker (default none), and
PromptProvider (local default, LangSmith Hub optional with local fallback).
LangSmith tracing is env-gated observability, not a Provider. Fail fast at
startup on missing keys; documented dev/prod presets in `.env.example`, no
NODE_ENV auto-switching.
