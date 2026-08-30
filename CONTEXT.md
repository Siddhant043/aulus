# Context — Aulus

Aulus is a self-hostable, open-source webapp for turning YouTube content into
(1) an agentic RAG chatbot you can question, and (2) a `skill-content.md` file
you hand to a coding agent to author a local agent skill.

## Ubiquitous language

The canonical terms for Aulus. Use these exact words — same meaning, same
spelling — in code, UI copy, issues, and docs; the `_Avoid_` notes flag the
wordings that cause confusion. Keep this list and the code in step: when a term
changes, change both.

### Source
A single YouTube link the user adds. One of three kinds:
- **video-kind** — resolves to one Video; the underlying Video is immutable
  (its transcript never changes).
- **channel-kind** — expands into many Videos; **mutable** (new videos appear
  over time).
- **playlist-kind** — expands into many Videos; **mutable**.

A channel- or playlist-kind Source is a **collection-type Source**: it is
subject to Sync. A Source is what the user added and what Collections group;
it is not the unit of RAG storage.

_Avoid_: calling a video-kind Source "a Video" — that word is reserved for the
Video entity.

### Video
A first-class YouTube video, keyed by YouTube video id. The unit that owns a
Transcript and Chunks. Many Sources can reference the same Video; it is stored
once. Produced when a video-kind Source is added or when a collection-type
Source expands / Syncs.

_Avoid_: Source, "child video" as a separate entity type.

### Collection
An optional, user-made grouping of **Sources only** (e.g. "all my Rust
videos"). Distinct from a collection-type Source. Chat and skill-content scope
= the union of Videos reachable from those Sources. Not the same word as
"collection-type Source" — when ambiguous, say **Collection (grouping)** vs
**collection-type Source**.

_Avoid_: grouping Videos directly; polymorphic Source-or-Video membership.

### Transcript
The caption text of a Video (plus title, description, chapters, timestamps),
owned 1:1 by that Video. The realistic text corpus — no audio/vision
processing. The canonical unit of RAG source material before chunking.

### Chunk
A retrievable slice of a Video's Transcript. Owned by the Video (via its
Transcript). Packed from caption segments to a ~512-token target with
**~10–20% whole-segment overlap** (~15% / ~64 tokens default) between adjacent
Chunks. The embedded text includes the overlap; a Citation uses the Chunk's
**core** (non-overlap) timestamp span so deep-links stay tight. Carries
embedding + retrieval metadata; rebuildable when chunking or embedding params
change.

_Avoid_: citing the full overlap-inflated time span; overlapping across chapter
boundaries.

### Ingestion
The background pipeline that turns a Source into retrievable Chunks:
resolve link → expand (channel/playlist → Videos) → fetch Transcript + metadata
→ chunk → embed → store. Runs on a worker off a queue as a parent
**ingest_source** Job that fans out **ingest_video** Jobs (one per Video).
Embedded Chunk text gets a **deterministic context prefix** (video title ·
chapter · chunk body); optional LLM contextualization is config-gated, off by
default. Embed batches (~64) and a small concurrent Video-Job cap (~2–3) are
the defaults. Videos with no captions are marked `unavailable`/`error` without
failing sibling Jobs. Long-running for collection-type Sources.

### Chat graph
The LangGraph answering loop for a Chat: **route → retrieve → rerank → grade ⇄
rewrite → generate**. Hybrid retrieve (HNSW + FTS, RRF; default pool **N=30**,
rerank keep **K=6**), pluggable rerank (**default `none`** / RRF order for
self-host). Bounded rewrite attempts (default 1, configurable). Only
**generate** streams tokens; Citations arrive as a final resolved event.
Before prompting, each kept Chunk expands by **±1 neighbor** in the same Video
(by `chunk_index`, never across chapter boundaries). Meta/chit-chat routes to
**answer_directly** (no retrieve, no Citations). The retrieve→rerank→grade
subgraph is shared with skill-content generation (D3).

_Avoid_: unbounded agent loops; LLM-invented timestamps; treating Ingestion and
the Chat graph as the same pipeline; duplicating retrieval for skill-content.

### Chat
A grounded question-and-answer session against a Scope — the RAG chatbot of
Feature 1. **Scope is fixed when the Chat is created** and applies to every
message in that thread. The chatbot retrieves the relevant Chunks and answers
**only** from them, streaming the reply over **SSE** (`status` / `token` /
`citations` / `done` / `error`) and attaching Citations as a final event.
Persisted assistant content is **display markdown** (Chunk-id markers already
resolved to deep-links); structured Citations live in `citations` jsonb.
API: `POST /chats`, `GET /chats`, `GET|DELETE /chats/:id`,
`POST /chats/:id/messages` (SSE). Creating a Chat with zero ready Videos is
allowed; **sending** a message then fails until the Scope has ready Videos.
Follow-ups use the last **N** messages (default 10) as model context; older
turns remain in history for UI only. At most **one in-flight answer** per Chat
(reject concurrent sends with 409). The React app uses separate routes for Chat
(`/chats`), Sources, and skill-content (D3 API); Chat does not embed
skill-content generation.

_Avoid_: "search" (Chat answers; it does not just list hits); presenting
ungrounded free-form LLM output as a Chat answer; changing Scope mid-thread;
WebSocket for Chat streaming; sending while Scope has zero ready Videos without
a clear error.

### Scope
The extent a Chat — or a skill-content generation — runs over: a single Source,
a Collection (grouping), or the whole Library. Chosen **per Chat** (or per
skill-content generation), not per message.

_Avoid_: assuming Chat is always over everything; treating Scope and Collection
as synonyms (a Collection is only one possible Scope); per-message Scope.

### Library
The full set of the user's Videos across every Source — the widest Scope
("everything").

_Avoid_: "database" / "index" (that is storage, not the domain concept);
equating the Library with a Collection.

### Citation
A reference — in a Chat answer or in skill-content — back to the exact Video and
timestamp a statement came from, rendered as a deep-link. **Deterministic**:
the model cites **Chunk ids** only; a resolver maps those ids to Chunk
`cite_*` metadata and a `youtu.be/?t=` URL. Ids not in the retrieved set are
dropped. Never invent timestamps.

_Avoid_: the word "source" for a Citation (reserved for Source);
model-fabricated references or timestamps.

### skill-content.md
The downloadable/copyable Markdown artifact from Feature 2. Two halves in one
file: (a) LLM-synthesized **Skill content** — citation-rich material aimed at
an agent that will author a SKILL.md (suggested name/description, overview,
procedures, examples from Videos), **not** a finished SKILL.md; and (b) the
curated **Best-practices template** (R4 v0.1) appended verbatim after a
horizontal rule. Produced by the **Skill-content generator** from a Scope plus
an optional **focus prompt** (empty = general skill-oriented digest). Consumed
by the user telling their agent "create a skill based on this skill-content.md".
**Versioned per Scope**: each regeneration **appends** an immutable version
(kept forever in v1); the user can browse and download any older version.
New versions are created by manual regenerate, or by Sync when it actually
ingested new Videos.

_Avoid_: overwriting prior generations in place; implying only one artifact
exists per Scope; auto-versioning on no-op Syncs; emitting a complete SKILL.md
inside skill-content.md.

### Skill-content generator
The multi-agent LangGraph that produces skill-content.md: **plan → retrieve →
synthesize → assemble → critic** (critic may revise once). **Plan** emits at
most **5 topics** (merged/prioritized for large Scopes). **Retrieve** reuses
the D2 retrieve→rerank→grade subgraph per topic. **Assemble** resolves
Chunk-id Citations and appends the static Best-practices template. **Critic**
checks: resolvable Chunk cites, R4-compliant suggested name/description, required
sections, synthesized half within budget (~3k tokens / ~400 lines) — one revise
then ship. Runs as a worker **`generate_skill_content`** Job (async); rejects
Scopes with zero **ready** Videos. Default run: Scope only, no focus prompt,
bundled template — one action after ingest.

_Avoid_: regenerating the Best-practices half; a single monolithic synthesizer
replacing the agent roster; synchronous API blocking on large Scopes; emitting
an artifact when nothing is retrievable.

### Focus prompt
Optional user text steering Skill-content generation (e.g. "skill for debugging
Rust borrow errors"). Empty focus ⇒ a general skill-oriented digest of the
Scope.

_Avoid_: requiring a focus prompt for the zero-config default; treating it as
the skill's final `description` field.

### Best-practices template
The curated, **static**, versioned half of skill-content.md: general
skill-authoring guidance that is independent of any Video and bundled with the
app. The counterpart to the synthesized content half.

_Avoid_: treating it as generated per request; blurring it with the content
half.

### Sync
Keeping a collection-type Source — and the artifacts derived from it — current
as new videos appear. One **sync_source** Job per Source: re-enumerate via
YouTube Data API, diff against `source_videos`, ingest new Videos, tombstone
removed ones (`removed_from_upstream_at`; excluded from that Source's Scope,
Video kept if shared). When the Sync finishes with new **ready** Videos,
enqueue **generate_skill_content** for Scope = that Source; no regen if zero
new ready Videos. Partial ingest failure is OK — Sync succeeds with a summary
counts object. Two triggers: an **automatic** once-daily in-worker cron at
**03:00 UTC** (all collection-type Sources) and a **manual** `POST
/sources/:id/sync` per Source, capped at once per rolling 24h
(`last_manual_sync_at`, independent of auto). At most one active `sync_source`
per Source (reject duplicate enqueue). **Adding** a Source runs initial
**ingest_source** only — Sync is for deltas afterward. `last_synced_at` =
last successful sync completion (auto or manual). video-kind Sources are never
Synced (their Video is immutable).

_Avoid_: Syncing a video-kind Source; treating the manual or automatic trigger
as unlimited; deleting shared Videos when they leave a playlist; regen on
no-op Syncs; duplicate concurrent Syncs for the same Source; re-enumerating
immediately on Source add.

### Provider
Pluggable AI backends in `@aulus/ai`, initialized once at startup via
`initProviders(config)` — **fail fast** if embeddings or primary LLM config is
invalid (`OPENAI_API_KEY` required; reranker key required when enabled). **LLM**
(primary + fallback via LangChain `.withFallbacks`, retryable errors only) and
**fast LLM** (route/grade/critic) are env-selected (`ollama` | `openai` |
`anthropic`); dev/prod presets are documented in `.env.example`, not
auto-switched by `NODE_ENV`. **Embeddings** are **fixed OpenAI**
(`text-embedding-3-small`, 1536-dim). **Reranker:** `none` | `cohere` | `voyage`
(default `none`). **Prompts:** `PromptProvider` — local files default; LangSmith
Hub optional with local fallback. **LangSmith** tracing is env-gated
(`LANGSMITH_TRACING` + key), not a Provider. Ollama unreachable: warn in dev,
fail in prod when primary is ollama.

_Avoid_: mixing embedding providers in one corpus; silent LLM downgrade to
ungrounded answers; requiring LangSmith to run; magic `NODE_ENV` provider switching.
