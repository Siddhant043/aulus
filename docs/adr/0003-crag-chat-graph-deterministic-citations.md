# CRAG-shaped Chat graph with deterministic Chunk-id Citations

Chat answering is a bounded LangGraph loop (route → retrieve → rerank → grade ⇄
rewrite → generate): hybrid HNSW+FTS fused with RRF (N=30→K=6), rerank default
`none` for self-host, rewrite budget default 1. The model may only cite Chunk
ids; a resolver maps them to `cite_*` deep-links and drops unknown ids — so
timestamps are never LLM-invented. Retrieve→rerank→grade is shared with
skill-content (D3); Ingestion stays a separate worker pipeline.
