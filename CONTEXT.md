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
Transcript). Timestamp-aware, so a citation points back to the Video at a
specific time. Carries embedding + retrieval metadata; rebuildable when
chunking or embedding params change.

### Ingestion
The background pipeline that turns a Source into retrievable Chunks:
resolve link → expand (channel/playlist → videos) → fetch Transcript + metadata
→ chunk → embed → store. Runs on a worker off a queue; long-running for
collection-type Sources.

### Chat
A grounded question-and-answer session against a Scope — the RAG chatbot of
Feature 1. The chatbot retrieves the relevant Chunks and answers **only** from
them, streaming the reply and attaching Citations.

_Avoid_: "search" (Chat answers; it does not just list hits); presenting
ungrounded free-form LLM output as a Chat answer.

### Scope
The extent a Chat — or a skill-content generation — runs over: a single Source,
a Collection (grouping), or the whole Library. Chosen per session.

_Avoid_: assuming Chat is always over everything; treating Scope and Collection
as synonyms (a Collection is only one possible Scope).

### Library
The full set of the user's Videos across every Source — the widest Scope
("everything").

_Avoid_: "database" / "index" (that is storage, not the domain concept);
equating the Library with a Collection.

### Citation
A reference — in a Chat answer or in skill-content — back to the exact Video and
timestamp a statement came from, rendered as a deep-link. **Deterministic**:
built from the cited Chunk's metadata, never invented by the model.

_Avoid_: the word "source" for a Citation (reserved for Source);
model-fabricated references.

### skill-content.md
The downloadable/copyable Markdown artifact from Feature 2. Two halves in one
file: (a) LLM-synthesized **content** from retrieved Transcripts with timestamped
citations, and (b) a curated, versioned **skill-authoring best-practices**
section. Produced by a multi-agent system, not a single prompt. Consumed by the
user telling their agent "create a skill based on this skill-content.md".

### Best-practices template
The curated, **static**, versioned half of skill-content.md: general
skill-authoring guidance that is independent of any Video and bundled with the
app. The counterpart to the synthesized content half.

_Avoid_: treating it as generated per request; blurring it with the content
half.

### Sync
Keeping a collection-type Source — and the artifacts derived from it — current
as new videos appear: it Ingests the newly-added Videos into RAG and refreshes
the derived skill-content. Two triggers: an **automatic** once-daily pass and a
**manual** "Sync now" capped at once per day. video-kind Sources are never
Synced (their Video is immutable). Exact mechanics: ticket D4.

_Avoid_: Syncing a video-kind Source; treating the manual or automatic trigger
as unlimited.

### Provider
A pluggable LLM or embedding backend selected via env/config, with a primary and
a fallback. Dev defaults to local Ollama for the LLM; embeddings are OpenAI in
all environments. No code change to switch providers.
