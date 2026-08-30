# Ingestion fans out per-Video Jobs with deterministic embed prefixes

Source ingest is a parent `ingest_source` Job that enqueues `ingest_video`
children (fetch → chunk → embed → store). Embeddings use a deterministic
title·chapter·body prefix; optional LLM contextualization is config-gated off
by default. Videos with no captions become `unavailable`/`error` without
failing sibling Videos — channels are partial by nature. Concurrency defaults
to small batches (≈64 embed, 2–3 video Jobs) to protect quota and yt-dlp.
