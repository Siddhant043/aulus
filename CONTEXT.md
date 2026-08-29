# Context — Aulus

Aulus is a self-hostable, open-source webapp for turning YouTube content into
(1) an agentic RAG chatbot you can question, and (2) a `skill-content.md` file
you hand to a coding agent to author a local agent skill.

## Glossary

### Source
A single YouTube link the user adds. One of three kinds:
- **Video** — one video; immutable (its transcript never changes).
- **Channel** — expands into its child videos; **mutable** (new videos appear over time).
- **Playlist** — expands into its child videos; **mutable**.

A Channel or Playlist is a **collection-type Source**: it is subject to Sync.

### Collection
An optional, user-made grouping of Sources (e.g. "all my Rust videos").
Distinct from a collection-type Source. Used to scope chat and skill-content
generation across a themed set. Not the same word as "collection-type Source" —
when ambiguous, say **Collection (grouping)** vs **collection-type Source**.

### Transcript
The caption text of a Video, plus metadata (title, description, chapters,
timestamps). The realistic text corpus — no audio/vision processing. The
canonical unit of RAG source material.

### Chunk
A retrievable slice of a Transcript. Timestamp-aware, so a citation points back
to a Video at a specific time.

### Ingestion
The background pipeline that turns a Source into retrievable Chunks:
resolve link → expand (channel/playlist → videos) → fetch Transcript + metadata
→ chunk → embed → store. Runs on a worker off a queue; long-running for
collection-type Sources.

### skill-content.md
The downloadable/copyable Markdown artifact from Feature 2. Two halves in one
file: (a) LLM-synthesized **content** from retrieved Transcripts with timestamped
citations, and (b) a curated, versioned **skill-authoring best-practices**
section. Produced by a multi-agent system, not a single prompt. Consumed by the
user telling their agent "create a skill based on this skill-content.md".

### Sync
Keeping a collection-type Source (and the artifacts derived from it) current as
new videos appear. Ingests newly-added videos into RAG and refreshes the
derived skill-content. Has an automatic cadence and a rate-limited manual
trigger (see ADRs / tickets for exact semantics).

### Provider
A pluggable LLM or embedding backend selected via env/config, with a primary and
a fallback. Dev defaults to local Ollama for the LLM; embeddings are OpenAI in
all environments. No code change to switch providers.
