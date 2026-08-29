# R2 — Retrieval architecture for timestamp-cited YouTube-transcript RAG

**Ticket:** R2 (research) · **Status:** findings, for D2 to lock · **Date:** 2026-08-30

## Summary

For a single-developer OSS project on **pgvector + LangChain/LangGraph JS**, the
evidence in 2026 points to a **two-stage retrieval core** — hybrid search (dense
pgvector + Postgres/BM25 lexical, fused with RRF) followed by a **hosted
cross-encoder reranker** — wrapped in a **small, conditional LangGraph agentic
loop** (route → retrieve → grade → optionally rewrite-and-retry → generate →
cite). This captures ~90% of the achievable quality at low complexity. The
heavier "advanced" techniques (HyDE, multi-query, full Self-RAG reflection-token
machinery) show **diminishing returns and real latency/cost penalties** on
transcript corpora and should be deferred behind feature flags or skipped.

Transcripts have two properties that drive the design: (1) they are **spoken,
noisy, keyword-poor** text where hybrid + rerank clearly beats pure vector, and
(2) every chunk must carry **`{video_id, start_sec, end_sec}`** so answers are
deep-linkable. Citation assembly is therefore a **data-plumbing concern, not an
LLM concern**: timestamps ride on chunk metadata end-to-end, and the generation
node is instructed to cite chunk IDs that we resolve to `youtu.be/ID?t=start`
links deterministically.

---

## Technique-by-technique verdicts

### Hybrid search (dense + sparse/BM25) — **ADOPT**
Dense vectors capture paraphrase/semantics; BM25 catches exact tokens (library
names, error codes, product names, CLI flags) that spoken transcripts are full
of and that embeddings routinely miss. Anthropic's own numbers show contextual
BM25 on top of contextual embeddings cuts retrieval-failure rate from a 35%
reduction (embeddings alone) to **49%** — i.e., the lexical leg is a large,
cheap chunk of the win. Multiple 2026 pgvector write-ups conclude hybrid beats
pure vector specifically for spoken content.

**pgvector fit:** excellent and native. One table, two indexes:
- `embedding vector(1536)` (OpenAI `text-embedding-3-small`) with an HNSW index.
- `tsv tsvector` (generated column) with a GIN index for Postgres FTS.

Run the two queries, fuse with **Reciprocal Rank Fusion** (`1/(k+rank)`, k≈60)
in SQL or in TS. RRF needs no score normalization and is robust — the default
recommendation across the pgvector hybrid literature. Postgres native
`ts_rank`/FTS is "good enough" to start; if lexical quality becomes the
bottleneck, a true-BM25 extension (**ParadeDB `pg_search`** or Tiger Data
**`pg_textsearch`**, which reached production-ready v1.3 in mid-2026) is a
drop-in upgrade **without leaving Postgres**. Start with built-in FTS to avoid
an extension dependency in a self-hostable app; document the BM25-extension path
as an optional performance tier.

### Reranking (cross-encoder / hosted) — **ADOPT** (as stage 2)
The single highest-leverage add-on. Anthropic: adding a reranker takes failure
reduction from 49% → **67%** (5.7% → 1.9%). Pattern: hybrid-retrieve a wide net
(top-**20 to 50**), rerank, keep top-5–8 for the prompt. Anthropic explicitly
recommends passing ~20 chunks after rerank for their corpus; for chat we'll
likely trim to fewer for latency/token cost — make it configurable.

**Options & cost (2026):**
- **Cohere Rerank 3.5 / Rerank 4** — ~$2.00 per 1,000 searches ($0.001/search,
  up to 100 docs/search); ~600ms typical; Rerank 4 (Dec 2025) has a 32K-token
  context vs 3.5's 4K. First-class **LangChain JS integration**
  (`CohereRerank`).
- **Voyage `rerank-2.5`** (Aug 2025) — token-priced ($0.05/M; `-lite` $0.02/M),
  ~600ms, 32K context. Cheapest at Aulus's likely volume.
- **Self-host** (bge-reranker / Qwen3-reranker via a local service) — zero
  marginal cost, keeps the "self-hostable, provider-agnostic" ethos, but adds an
  ops surface. 

**Fit for Aulus:** make the reranker a **Provider-style pluggable** (mirroring
the existing LLM/embedding provider abstraction): default to a hosted reranker
(Cohere or Voyage) for hosted deployments, allow a local reranker or
**`none` (RRF-only)** for pure self-host. Reranking is 60–84% of pipeline
latency in benchmarks, so it must be togglable.

### Anthropic-style contextual retrieval — **CONSIDER** (phase 2)
Prepend a 50–100-token LLM-generated blurb ("this clip is from <video title>,
where <speaker> is explaining X") to each chunk **before** embedding and BM25
indexing. Strong, well-documented quality lift and a natural fit for
transcripts, where a bare 60-second window often lacks context ("as I said, the
second option is better…"). 

**But** it's an **ingestion-time cost**: one LLM call per chunk. At Aulus's
scale (channels/playlists = thousands of chunks) that is real money and time,
partly mitigated by prompt caching (Anthropic quote ~$1.02 per million doc
tokens with caching). **Cheaper transcript-specific alternative:** deterministic
context injection — prepend the **video title, chapter title, and preceding
sentence** to each chunk with zero LLM calls, capturing most of the benefit.
**Verdict:** ship deterministic metadata-prefix contextualization in v1
(near-free); gate LLM-generated contextual retrieval behind a config flag for
users who want max quality and will pay the ingestion cost.

### Parent-child / sentence-window retrieval — **ADOPT** (transcript-native form)
This is essentially free and maps perfectly onto transcripts. **Embed small,
retrieve small, but return an expanded window** for generation: index tight
chunks (~60s / 300–600 tokens) for retrieval precision, then at generation time
expand each hit to its neighbors (or its parent chapter) so the LLM sees
coherent context. Because chunks are time-ordered per video, "expand the window"
is a trivial `start_sec BETWEEN` query — no separate parent docstore needed.
Keeps embeddings precise while giving the model enough context to answer and
cite accurately. **Adopt** the sentence-window variant; skip formal
LlamaIndex-style parent-child hierarchies as overkill.

### Multi-query / query expansion — **CONSIDER** (cheap, flag it)
Generating 2–3 query variants and unioning results helps with ambiguous/
underspecified chat questions. Cheap-ish (one small LLM call) and easy in
LangGraph. But 2026 benchmarks (ARAGOG and others) find multi-query is
**sometimes worse than naive RAG** and adds latency. **Verdict:** don't put it
on the default path. Better: let the **agentic rewrite loop** (below) do
targeted query reformulation only *when grading says retrieval failed* — same
benefit, paid only on the hard queries.

### HyDE (hypothetical document embeddings) — **SKIP** (default), consider for cold queries
HyDE (embed an LLM-hallucinated answer instead of the raw question) helps most
when queries are very short and the corpus is homogeneous. 2026 evidence shows
**limited/again-inconsistent benefit and a per-query LLM-latency tax**, and it
can *hurt* on precise/keyword queries — exactly the ones BM25 already nails.
With hybrid+rerank in place, HyDE's marginal value is small. **Skip on the
default path**; note it as an experiment only if eval shows a class of short,
vague questions underperforming.

### Agentic RAG in LangGraph JS — **ADOPT** (a *small* corrective loop)
The right amount of "agentic" is the key judgment call. The three canonical
patterns (LangChain's own framing):
- **Corrective RAG (CRAG):** retrieve → **grade documents** → if weak, rewrite
  query and/or fall back to another source, then retrieve again → generate. A
  compact, well-behaved loop.
- **Self-RAG:** reflection-token machinery grading relevance (ISREL), grounding/
  support (ISSUP), and utility (ISUSE); loops on both retrieval and generation.
  More nodes, more LLM calls, more ways to loop forever.
- **Adaptive RAG:** a **router** first classifies the query (e.g., no-retrieval
  chit-chat vs. single-shot vs. needs-iteration) and dispatches to the cheapest
  sufficient path.

**Verdict:** adopt a **CRAG-shaped loop plus a lightweight adaptive router**,
and borrow only Self-RAG's **grounding check** (does the answer's citations
actually support it?) as a final guard. Full Self-RAG token machinery is **skip**
— too many moving parts for a solo maintainer, and every extra LLM grade is
latency + tokens. Aulus has **no web-search fallback** (closed corpus of the
user's own videos), so CRAG's "search the web" branch becomes "**rewrite +
widen retrieval**, and if still empty, honestly say the videos don't cover it"
— which is the correct behavior for this product anyway.

---

## Recommended pipeline shape (for D2 to lock)

A single LangGraph `StateGraph` in TypeScript. Keep it **≤6 nodes** with a
**bounded** retry (max 1–2 rewrites) so it can't loop forever.

### State
```ts
const GraphState = Annotation.Root({
  question:   Annotation<string>,
  route:      Annotation<"answer_directly" | "retrieve">,
  query:      Annotation<string>,                 // current (possibly rewritten) search query
  chunks:     Annotation<RetrievedChunk[]>,        // carries {id, videoId, startSec, endSec, text, score}
  graded:     Annotation<RetrievedChunk[]>,        // relevant subset
  attempts:   Annotation<number>({ reducer:(a,b)=>a+b, default:()=>0 }),
  answer:     Annotation<string>,
  citations:  Annotation<Citation[]>,
});
```
Note: `RetrievedChunk` carries timestamps from the very first retrieval hit;
**nothing downstream ever discards them**. This is what makes citation assembly
deterministic.

### Nodes
1. **`route`** (adaptive) — one cheap LLM (or heuristic) call. Chit-chat /
   meta ("what can you do?") → `answer_directly`. Anything about video content →
   `retrieve`. Also scopes retrieval to the active Collection/Source filter.
2. **`retrieve`** — hybrid search against pgvector: dense (HNSW) + FTS/BM25 in
   parallel, **RRF-fused**, top-N (≈30). Metadata filter by
   `source_id/collection`. Optional: prepend deterministic context at index time
   (title/chapter) — handled in ingestion, transparent here.
3. **`rerank`** — hosted/local cross-encoder over the N candidates; keep top-K
   (≈6). Pluggable Provider; `none` ⇒ pass RRF order through.
4. **`grade`** — one structured-output LLM call: are the top-K actually relevant
   to `question`? Returns the relevant subset + a boolean `sufficient`.
   - Conditional edge: `sufficient` → **`generate`**;
     `!sufficient && attempts < MAX` → **`rewrite`**;
     `!sufficient && attempts >= MAX` → **`generate`** (with an
     "insufficient coverage" flag so the answer can say so honestly).
5. **`rewrite`** — reformulate `query` (expand terms, disambiguate), `attempts += 1`,
   loop back to **`retrieve`**. (This is where query-expansion earns its keep —
   only on hard queries.)
6. **`generate`** — expand each kept chunk to its **sentence-window / chapter
   neighbors** (cheap `start_sec BETWEEN` query per video), build the prompt,
   and instruct the model to **cite by chunk id**. Then a deterministic
   post-step resolves cited ids → `Citation{ videoId, startSec, title, url:
   youtu.be/ID?t=startSec }`. Optional **grounding guard** (borrowed from
   Self-RAG): verify each sentence's cited chunk actually supports it; drop or
   flag unsupported claims.

### Edges (flow)
```
START → route
route ─(answer_directly)→ generate → END
route ─(retrieve)→ retrieve → rerank → grade
grade ─(sufficient)──────────────→ generate → END
grade ─(insufficient & attempts<MAX)→ rewrite → retrieve   (loop)
grade ─(insufficient & attempts≥MAX)→ generate → END
```

### Where citations get assembled
- **Retrieval** attaches `{videoId, startSec, endSec}` to every candidate.
- **Rerank/grade** only *filter/reorder* — timestamps ride along untouched.
- **Generate** references chunk ids; a **deterministic resolver** (not the LLM)
  turns ids into timestamped deep-links. The LLM never invents timestamps, so
  citations can't hallucinate. The optional grounding guard is the last check
  that a cited clip really backs the claim.

This same graph (minus `answer_directly`, plus a synthesis/outline layer) is the
retrieval substrate that **Feature 2's `skill-content.md` generator** reuses —
retrieval logic stays in one place.

---

## Complexity / cost / latency notes

| Stage | Latency | Marginal $ | Complexity |
|---|---|---|---|
| Hybrid retrieve (pgvector + FTS + RRF) | ~10–50ms | ~0 (self-hosted PG) | Low — SQL + one migration |
| Rerank (hosted) | ~300–600ms | ~$0.001/query (Cohere) or token-priced (Voyage) | Low — LangChain JS `CohereRerank`; make pluggable |
| `route` + `grade` LLM calls | +1 small call each | cheap on a small model (local Ollama in dev) | Low |
| `rewrite` loop | only on hard queries; +1 retrieve cycle | occasional | Medium — needs a bounded-attempts guard |
| LLM contextual retrieval (ingestion) | offline | ~$1/M doc tokens w/ caching | Medium — defer / flag |
| HyDE / multi-query on default path | +1 call/query, often no gain | wasted | **Not worth it** |

**Guardrails a solo maintainer needs:** cap `attempts` (1–2), set a hard graph
recursion limit, make rerank + grade individually togglable (so a pure-local,
zero-hosted-API deployment still works with RRF-only + no grading), and keep the
graph small enough to reason about. Reranking dominates latency, so expose it as
config. Everything stays inside Postgres — no separate vector DB, no separate
search cluster — which is the biggest single win for maintainability.

**What to build first (v1):** hybrid (dense + FTS + RRF) → optional rerank →
generate-with-deterministic-citations, sentence-window expansion, deterministic
metadata-prefix contextualization at ingest. **Add next (v1.1):** the
`grade → rewrite` corrective loop and the adaptive `route`. **Defer / flag:**
LLM contextual retrieval, BM25 extension, grounding guard. **Skip unless eval
demands:** HyDE, default-path multi-query, full Self-RAG.

---

## Sources

LangGraph / LangChain (primary):
- Self-Reflective / Agentic RAG with LangGraph (CRAG, Self-RAG, Adaptive RAG) — https://www.langchain.com/blog/agentic-rag-with-langgraph
- LangGraph.js docs — StateGraph, Annotation, conditional edges, private state between nodes — https://langchain-ai.github.io/langgraphjs/ (how-to: https://langchain-ai.github.io/langgraphjs/how-tos/pass_private_state/)
- LangChain JS Cohere Rerank integration — https://js.langchain.com/docs/integrations/document_compressors/cohere_rerank/

Anthropic / retrieval quality (primary):
- Contextual Retrieval in AI Systems — Anthropic Engineering (35% / 49% / 67% failure-reduction numbers, top-20, ~$1.02/M w/ caching) — https://www.anthropic.com/engineering/contextual-retrieval

pgvector hybrid search:
- Introducing pg_textsearch: true BM25 ranking + hybrid retrieval in Postgres (Tiger Data) — https://www.tigerdata.com/blog/introducing-pg_textsearch-true-bm25-ranking-hybrid-retrieval-postgres
- Build hybrid search with BM25 and vector similarity (Tiger Data docs) — https://www.tigerdata.com/docs/build/examples/hybrid-search
- Hybrid Search in PostgreSQL: The Missing Manual (ParadeDB) — https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual
- Hybrid Search in 100 Lines: BM25 + pgvector with RRF Merge — https://dev.to/gabrielanhaia/hybrid-search-in-100-lines-bm25-pgvector-with-rrf-merge-58cn

Rerankers (cost/latency):
- Cohere Rerank v3.5 pricing — https://openrouter.ai/cohere/rerank-v3.5 ; Rerank 4 — https://openrouter.ai/cohere/rerank-4-pro
- Reranker models compared (Cohere / Voyage / Jina / BGE — latency & nDCG) — https://particula.tech/blog/reranker-models-compared-cohere-voyage-jina-bge-latency-ndcg
- Best Rerankers for RAG leaderboard — https://agentset.ai/rerankers

HyDE / multi-query diminishing returns:
- ARAGOG: Advanced RAG Output Grading — https://arxiv.org/pdf/2404.01037
- 12 Advanced RAG Techniques [2026] (Atlan) — https://atlan.com/know/advanced-rag-techniques/
- Retrieval Is the Bottleneck: HyDE, Query Expansion, Multi-Query for production — https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a

Transcript chunking & timestamp citations:
- Build a RAG pipeline with YouTube Transcripts in 2026 — https://transcriptapi.com/blog/rag-pipeline-with-youtube-transcripts
- RAG for Video Transcripts: Architecture, Chunking, Citations — https://vidnavigator.com/en/blog/rag-for-video-transcripts
- Citation-Aware RAG: fine-grained citations (Tensorlake) — https://www.tensorlake.ai/blog/rag-citations
- RAG Chunking and Parsing for Transcripts and Media (Oracle) — https://blogs.oracle.com/developers/rag-chunking-and-parsing-for-tables-pdfs-transcripts-and-media
