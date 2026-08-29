# R3 — Chunking YouTube Transcripts for Accurate, Timestamp-Citable Retrieval

**Status:** Research complete · **Date:** 2026-08-30 · **Owner:** Aulus RAG pipeline

---

## Summary

YouTube transcripts arrive as an ordered list of short caption segments, each carrying `{ start, duration, text }`. This is a gift for citation (every word already has a timestamp) and a problem for retrieval (individual segments are far too small to embed — often 3–10 words). The task is therefore **not** "split a document into pieces" but **"merge many tiny timestamped segments into retrieval-sized chunks while carrying the timestamps forward."**

Recommendation in one line: **greedily pack caption segments into ~512-token chunks with ~15% (≈64-token) overlap, preferring to break at sentence/pause boundaries, keeping chapter boundaries hard, and set each chunk's `start_sec` = first segment's start and `end_sec` = last segment's start+duration.** For punctuation-poor auto-captions, run a lightweight punctuation-restoration pass (or fall back to pause-based segmentation) *before* packing.

Off-the-shelf LangChain JS splitters (`RecursiveCharacterTextSplitter`, `TokenTextSplitter`) **do not suffice on their own** — they operate on a flattened string and destroy the segment→timestamp mapping. You need a thin custom merger that owns timestamp propagation; LangChain's splitter is at most an optional sub-step inside a single chapter.

---

## Comparison of strategies

### 1. Fixed-token (character/token) splitting
Flatten transcript to one string, split every N tokens with overlap.

- **Pros:** trivial, zero model calls, milliseconds, benchmark-strong. Recursive/fixed splitting at 512 tokens scored **69% / 67%** end-to-end accuracy in the 2026 FloTorch benchmark (50 papers, ~906k tokens) — the top of the field.
- **Cons:** If you flatten first, you **lose the per-segment timestamps** and can only re-derive an approximate chunk timestamp by proportional character offset — lossy and error-prone. Splits mid-sentence.
- **Verdict:** Good *token accounting* model, wrong *unit of operation*. Adopt its sizing (512/64) but operate on segments, not a flat string, so timestamps survive.

### 2. Sentence / semantic splitting
Embed sentences (or windows) and cut where semantic similarity drops.

- **Pros:** best raw retrieval recall in isolation — Chroma Research measured **91.9% recall** for semantic chunking.
- **Cons:** Expensive (an embedding call per sentence at ingest), and it **over-fragments**: FloTorch's semantic chunker produced ~43-token fragments that "retrieved cleanly but gave the LLM too little context," collapsing end-to-end answer accuracy to **54%**. Spoken-word transcripts have weak topic signals, making similarity cuts noisy. Requires reliable sentence boundaries, which auto-captions lack.
- **Verdict:** Do **not** make this the primary strategy. Retrieval recall is a trap if downstream answer accuracy falls. Use its *idea* (prefer semantic/pause boundaries as break points) but bound chunk size with a token floor/ceiling.

### 3. Segment / window-based (time or token windows over caption segments)
Accumulate native caption segments until a target size (in tokens, or a fixed time window like 30–60 s), then emit a chunk.

- **Pros:** operates directly on the timestamped segments, so **timestamp propagation is exact and free**. Respects the transcript's natural structure. No per-sentence model calls.
- **Cons:** naive fixed windows can still cut mid-sentence; needs a boundary-preference rule to be good.
- **Verdict:** **This is the correct backbone for Aulus.** Combine token-target packing (strategy 1's sizing) with boundary preference (strategy 2's instinct), operating over segments (this strategy's data model). Prefer a **token target over a pure time window** — speaking rate varies 2–3× (a 60 s window can be 90 or 260 tokens), and embeddings care about tokens, not seconds.

### Overlap strategies
- **Token overlap (recommended):** carry the last ~64 tokens (whole segments) of chunk *n* into the head of chunk *n+1*. Mitigates the boundary-straddle failure where one relevant sentence is split across two chunks. 10–20% of chunk size is the consensus band (Azure suggests up to 25% as a conservative baseline); **~15% (64 tokens on 512) is the sweet spot** — enough to heal boundaries without bloating the index or double-counting in citations.
- **Timestamp of overlap:** define each chunk's citation span by its **core** (non-overlap) segments, or simply first-start → last-end including overlap. Keep it consistent; the overlap region legitimately belongs to both chunks in time, so either is defensible — prefer core span for tighter deep-links.
- **Sentence/segment overlap (alternative):** overlap by 1–2 whole sentences instead of a raw token count. Cleaner semantically; use if punctuation is reliable.

---

## Handling punctuation-poor auto-captions

Auto-generated (ASR) captions are frequently run-on, lowercased, and unpunctuated, which breaks any sentence-based splitting and hurts embedding quality. Two-tier approach:

1. **Detect** auto-captions (YouTube's timedtext `kind=asr`, or heuristic: near-zero `.?!` density, low capitalization). Manually-uploaded captions usually already have punctuation — skip restoration for them.
2. **Restore boundaries** on ASR text before packing, via the cheapest option that works:
   - **Pause-based segmentation (no model):** insert a soft sentence break wherever the inter-segment time gap exceeds a threshold (e.g. > 0.7 s of silence) or a segment ends a long clause. This exploits data you already have (timestamps) and needs zero ML. Good default fallback.
   - **Lightweight punctuation-restoration model:** a small punctuation/capitalization model (e.g. an ONNX/`deepmultilingualpunctuation`-class model, or the `cl100k`-friendly small transformers used for streaming ASR) adds `.?!,` and capitalization. Research shows punctuation restoration measurably improves downstream structure understanding and readability, and it makes both sentence-splitting and embeddings better.
   - **Do not** send every transcript through a large LLM for repunctuation at ingest — too slow/expensive at scale. Reserve LLM cleanup for display-time or high-value content.
3. **Always keep a raw copy.** Embed the normalized/repunctuated text; store the original for display and for exact deep-link verification. (Light cleaning: strip `[music]`/`[laughter]` bracket tags and filler `um/uh`, collapse whitespace — but keep the un-normalized copy.)

---

## Chapter-aware splitting

YouTube "chapters" come from timestamp lists in the video description (e.g. `0:00 Intro`, `4:12 Setup`) or the Data API, and are strong human-authored topic boundaries.

- **Treat chapter boundaries as hard chunk boundaries** — never let a chunk span two chapters, and never let overlap bleed across a chapter edge. This keeps chunks topically coherent and lets you cite the chapter title alongside the timestamp.
- **Store `chapter_title` in chunk metadata** — excellent for display, filtering, and as a lightweight retrieval signal / rerank feature.
- **If no chapters exist:** fall back to plain segment-window packing over the whole transcript. Optionally auto-generate chapters (TF-IDF/embedding topic-shift detection, or a one-shot LLM pass) for navigation, but this is a nice-to-have, not required for retrieval.

---

## Recommended algorithm (timestamp propagation included)

**Input:** ordered caption segments `seg[i] = { start, dur, text }`; optional chapter list `chapters = [{ start, title }]`.
**Output:** chunks `{ text, start_sec, end_sec, video_id, chapter_title?, chunk_index }`.

1. **Fetch & retain structure.** Pull the timed transcript. **Do not flatten to a string** — keep the array of `{ start, dur, text }`. Detect whether captions are ASR (`kind=asr`) for step 3.
2. **Light-clean each segment.** Strip bracket annotations (`[music]`), drop pure filler tokens, collapse whitespace. Keep an untouched `raw_text` copy per segment for display.
3. **Restore boundaries (ASR only).** If auto-captions: run pause-based break insertion (gap > ~0.7 s ⇒ sentence break) and/or a lightweight punctuation model, producing sentence markers. Manual captions: use their existing `.?!` as markers.
4. **Partition by chapter.** If chapters exist, split the segment list into per-chapter sublists at the nearest segment to each chapter start. Process each chapter independently so no chunk crosses a chapter edge.
5. **Greedy token packing within each partition.** Maintain a running buffer of segments and a running token count (measure with `tiktoken`/`cl100k_base` — same tokenizer family as the embedding model):
   - Add segments one by one, accumulating `token_count`.
   - When `token_count` reaches the **target (512)**, look for a **preferred break** (a sentence boundary or a large inter-segment pause) within a small look-back window; cut there. If none is found before the **hard max (768)**, cut at the current segment.
   - Emit the buffered segments as one chunk.
6. **Propagate timestamps (the core step).** For the emitted chunk:
   - `start_sec = firstSeg.start`
   - `end_sec = lastSeg.start + lastSeg.dur`  *(fall back to `nextSeg.start` if `dur` is missing/zero)*
   - `text = join(segment texts, " ")` (normalized version for embedding; keep raw for display).
   Because chunks are built *from* segments, these timestamps are exact — no proportional/character-offset estimation.
7. **Apply overlap.** Seed the next chunk's buffer with the trailing whole segments of the just-emitted chunk totaling **~64 tokens** (never crossing a chapter boundary). Overlap moves in whole segments so timestamps stay exact. Define the citation span from the chunk's **core** (non-overlap) segments to keep deep-links tight.
8. **Attach metadata & index.** Store `{ video_id, chapter_title?, chunk_index, start_sec, end_sec, token_count, is_asr }`. Embed the normalized text with OpenAI embeddings (1536-dim; 512-token chunks sit comfortably inside the ~8k context, so no truncation risk).
9. **Cite at answer time.** Have the LLM cite `[video_id:start_sec]`; render as a deep-link `https://youtu.be/VIDEO_ID?t=<floor(start_sec)>` (or `&t=` for full URLs), optionally showing `chapter_title` and `mm:ss`.

**Optional retrieval upgrade:** spoken content benefits from **hybrid retrieval (dense embeddings + BM25/keyword)** more than clean prose does — worth enabling since ASR text is noisy and full of proper nouns.

---

## Recommended default parameters

| Parameter | Default | Notes |
|---|---|---|
| Target chunk size | **512 tokens** | Benchmark-validated sweet spot; factoid-leaning. Use 256–512 for short-answer heavy corpora. |
| Hard max chunk size | **768 tokens** | Safety ceiling when no good break is found. |
| Min chunk size | **~128 tokens** | Merge undersized trailing chunks into the previous one to avoid 43-token fragments. |
| Overlap | **64 tokens (~15%)** | Whole-segment overlap; band 10–20%. |
| Tokenizer | **`cl100k_base` (tiktoken)** | Matches OpenAI embedding tokenization. |
| Break preference | sentence end > long pause (>0.7 s) > segment boundary | Applied within a look-back window near the target. |
| Chapter boundary | **hard split** | No chunk or overlap crosses it. |
| ASR pause threshold | **~0.7 s** | For boundary restoration when punctuation absent. |
| Embeddings | OpenAI, 1536-dim, ~8k ctx | 512-token chunks never truncate. |

---

## Edge cases

- **Pure auto-captions, no punctuation:** run repunctuation or pause-based breaks (step 3); if both unavailable, packing still works on token count alone — you just lose the "prefer sentence boundary" nicety. Set `is_asr=true` and add a "captions may contain errors" note to the answer prompt.
- **Very long videos (multi-hour):** nothing special beyond chapter partitioning; per-chapter packing keeps memory bounded and chunks coherent. `chunk_index` stays globally ordered for windowed context expansion at retrieval time.
- **No chapters:** pack over the whole transcript; optionally auto-derive chapters for UI navigation only.
- **Missing/zero `dur` on segments:** derive `end_sec` from the next segment's `start`; for the final segment, use video duration or `start + estimated`.
- **Overlapping/rolling ASR captions** (YouTube ASR sometimes repeats words across segments): de-duplicate on merge so the same phrase isn't embedded twice and citation spans don't inflate.
- **Non-speech-only stretches** (`[music]` for minutes): after cleaning these may be empty — skip emitting empty chunks but preserve the time gap so a following chunk's `start_sec` is still correct.
- **Multiple speakers:** if diarization is available, add `speaker` to metadata and optionally prefer speaker-change points as break candidates.

---

## LangChain JS: does it suffice?

**No, not alone — but useful as a sub-component.**

- `RecursiveCharacterTextSplitter` measures size in **characters** and splits a **flat string**; `TokenTextSplitter` (with `encodingName: "cl100k_base"`) measures tokens but still consumes a flat string. Both **discard the segment→timestamp mapping**, which is the one thing you cannot afford to lose. Reconstructing timestamps by character offset after the fact is lossy.
- **Recommended pattern:** own the greedy segment-packing + timestamp propagation yourself (steps 5–7). It's ~50 lines. You may *optionally* call `TokenTextSplitter` **inside a single chapter** to size sub-splits, but you must map results back to segment indices to recover timestamps — usually more trouble than the direct merger.
- Reuse LangChain for what it's good at downstream: `Document` objects (`pageContent` + `metadata` carrying your timestamps), vector-store integrations, and retrievers.

---

## Sources

- [Build a RAG pipeline with YouTube Transcripts (TranscriptAPI, 2026)](https://transcriptapi.com/blog/rag-pipeline-with-youtube-transcripts) — segment-boundary chunking, 200–500 word chunks, `{video_id, start_sec, end_sec}` metadata, `youtu.be/ID?t=` deep-links, auto-caption caveats.
- [RAG for Video Transcripts: Architecture, Chunking, and Timestamps (VidNavigator)](https://vidnavigator.com/en/blog/rag-for-video-transcripts) — 300–600 tokens + ~50 overlap, "don't flatten at ingestion," `TranscriptChunk` dataclass, normalize-for-embed/keep-raw-for-display, prefer pause/punctuation/topic boundaries.
- [RAG Chunking Strategies: The 2026 Benchmark Guide (Prem AI)](https://www.premai.io/blog/rag-chunking-strategies-the-2026-benchmark-guide/) — FloTorch benchmark: recursive 512 = 69%, fixed 512 = 67%, semantic = 54% end-to-end; recursive 512 + 50–100 overlap as validated default; overlap 10–20%.
- [Best Chunking Strategies for RAG and LLMs in 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-chunking-strategies-rag) — chunk-size-by-query-type guidance, semantic over-fragmentation failure mode.
- [Chroma Research — chunking recall study (referenced in Prem AI guide)](https://research.trychroma.com/) — semantic chunking 91.9% retrieval recall vs. weaker end-to-end accuracy.
- [LangChain JS — Recursive text splitter](https://docs.langchain.com/oss/javascript/integrations/splitters/recursive_text_splitter) — `chunkSize`/`chunkOverlap` are character-based; splitter consumes flat text.
- [LangChain JS — Split by token (TokenTextSplitter + tiktoken)](https://docs.langchain.com/oss/javascript/integrations/splitters/split_by_token) — token-based splitting with `encodingName: "cl100k_base"`.
- [Punctuation Restoration Improves Structure Understanding without Supervision (arXiv 2402.08382)](https://arxiv.org/html/2402.08382v4) — restoring punctuation improves downstream structure/readability of ASR text.
- [Fast and Accurate Capitalization and Punctuation for ASR using Transformer and Chunk Merging (arXiv 1908.02404)](https://arxiv.org/pdf/1908.02404) — lightweight/parallel punctuation+capitalization restoration for long ASR transcripts.
- [Automate Video Chaptering with LLMs and TF-IDF (Towards Data Science)](https://towardsdatascience.com/automate-video-chaptering-with-llms-and-tf-idf-f6569fd4d32b/) — auto-generating chapters when none exist, for chapter-aware splitting/navigation.
