# Prompt catalog and evaluation harness

Prompts live in `packages/ai/prompts/` as TypeScript `ChatPromptTemplate`
modules, keyed by dotted names (`chat.generate`, `skill.plan`, …) and loaded
only through `PromptProvider`. Local files are canonical; optional LangSmith
Hub mirror via `prompts:push` with `production` tag and local fallback on pull
failure. Eval is opt-in: golden JSONL + fixture corpus, `bun run eval` scoring
recall@K, deterministic citation correctness, and fast-LLM groundedness;
`EVAL_LANGSMITH=true` uploads experiments when configured. Never required for
self-host or default CI.
