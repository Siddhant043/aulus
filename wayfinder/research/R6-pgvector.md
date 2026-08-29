# R6 — Postgres + pgvector from a Bun/TypeScript backend (OpenAI 1536-dim)

_Research ticket R6. Verified against current (Aug 2026) docs: pgvector 0.8.x, Drizzle ORM ≥0.36 (helpers) / 0.45.x (current), Bun 1.4.x._

## Summary

For Aulus (Bun + Hono + Postgres/pgvector + OpenAI `text-embedding-3-*`, 1536-dim), the recommended stack is:

- **Driver:** `postgres` (porsager / postgres.js). It is the most battle-tested Postgres driver under Bun, is the driver Drizzle's `postgres-js` adapter is built on, and works cleanly with `pgvector` serialization. Bun's built-in `Bun.sql` works but is younger and its docs explicitly list no extension/type-registration helpers — fine for raw queries, not what we want to standardize D1/D2 on.
- **Data access:** **Drizzle ORM** for schema, migrations, and most queries (it has first-class `vector` column + `cosineDistance`/`l2Distance`/`innerProduct` helpers), dropping to **raw SQL** (via `sql` template) for hybrid search / RRF and any index DDL.
- **Column:** `vector(1536)`.
- **Index:** **HNSW** with `vector_cosine_ops` (OpenAI embeddings are L2-normalized ⇒ cosine). Default to `m=16, ef_construction=64`; bump `ef_construction` to 128–200 for better recall at build time; tune recall at query time with `hnsw.ef_search`. Prefer HNSW over IVFFlat as the default: better speed/recall, no need to pre-populate data, less tuning.
- **Distance operator:** `<=>` (cosine distance). Similarity = `1 - (embedding <=> query)`.
- **Migrations:** `drizzle-kit generate` + `drizzle-kit migrate` (SQL-file migrations), with the pgvector index written as raw SQL in the migration to avoid a known `drizzle-kit push` opclass bug.

---

## 1. Driver / ORM recommendation (with Bun caveats)

### Driver options under Bun (2026)

| Option | Verdict for Aulus | Notes |
|---|---|---|
| **`postgres` (postgres.js)** | ✅ Recommended | Cross-runtime, most-used low-level Postgres lib in TS; runs well on Bun; is what Drizzle's `drizzle-orm/postgres-js` wraps. `pgvector` supports it via `pgvector.toSql()`. |
| **`Bun.sql` (built-in)** | ➖ Viable, not chosen | Zero-dependency, fastest cold start, native tagged-template + pooling + transactions (incl. 2PC) + LISTEN/NOTIFY. But Bun 1.4 docs list **no pgvector/extension helpers**, no column-name transforms, and `bigint` returns as string by default. Good for scripts/edge; we don't want to hand-roll vector plumbing for D1/D2. |
| **`pg` (node-postgres)** | ➖ Works | Fine on Bun; needs explicit `pgvector.registerTypes(client)` per connection. Slower/heavier than postgres.js; only pick if a dependency forces it. |
| **Prisma** | ❌ Avoid | Historically the weakest Bun story (engine/native-binding friction) and pgvector remains second-class (requires `Unsupported("vector")` + raw SQL for similarity). Not worth it here. |

**Recommendation:** `postgres` (postgres.js) as the physical driver, consumed through Drizzle.

### ORM / query-builder vs raw SQL

Drizzle ships **first-class pgvector support**: a `vector` column type in `drizzle-orm/pg-core`, `.op('vector_cosine_ops')` for index opclasses, and distance helpers `cosineDistance` / `l2Distance` / `innerProduct` in `drizzle-orm`. Insert/query take plain `number[]` — no manual `toSql()` needed. This covers the 90% path (typed schema, KNN queries, metadata filtering) with type safety.

Use **raw SQL** (Drizzle's `sql` template or the driver directly) for:
- **Hybrid search / RRF** (CTEs + `websearch_to_tsquery` + `FULL OUTER JOIN`) — too dynamic for the builder.
- **Index DDL** with opclass — see the drizzle-kit bug in §4.
- **Session GUCs** like `SET hnsw.ef_search = ...`.

Prisma-style "everything through the ORM" is not recommended for vector ops; Drizzle's escape hatch to `sql` is the right seam.

---

## 2. Schema + index recommendation

### Column

pgvector 0.8.6 supports Postgres 13+. Enable the extension and define the column at 1536 dims:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE items (
  id         bigserial PRIMARY KEY,
  content    text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  embedding  vector(1536)
);
```

Drizzle schema:

```typescript
import { pgTable, bigserial, text, jsonb, vector, index } from 'drizzle-orm/pg-core';

export const items = pgTable(
  'items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (t) => [
    index('items_embedding_hnsw')
      .using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);
```

### HNSW vs IVFFlat — choose HNSW by default

| | **HNSW** (default choice) | **IVFFlat** |
|---|---|---|
| Speed/recall | Best query performance at high recall | Lower memory/faster build, worse speed–recall |
| Build time / memory | Slower build, more memory | Faster build, less memory |
| Data requirement | Can be built on an **empty** table | Should be built **after** representative data exists (needs to learn list centroids) |
| Tuning | Little; robust defaults | Sensitive to `lists`/`probes` |
| When to use | RAG / semantic search (Aulus) | Very large, write-heavy, memory-constrained, recall-tolerant |

**Default to HNSW.** For most RAG/semantic-search workloads it's the safer default: high recall without surprises and it can be created before rows are loaded.

**HNSW parameters** (defaults / recommendations):
- `m = 16` (max edges per node) — default; keep unless recall demands more.
- `ef_construction = 64` (default). Community production start for 1536-dim is **128–200** for better recall at the cost of build time.
- `hnsw.ef_search = 40` (default query-time candidate list). Raise per query for recall:

```sql
CREATE INDEX items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

SET hnsw.ef_search = 100;  -- per-session/tx; higher = better recall, slower
```

**IVFFlat reference** (if ever needed):
```sql
CREATE INDEX ON items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
SET ivfflat.probes = 10;  -- default probes = 1 gives poor recall
```
`lists ≈ rows/1000` for ≤1M rows, `≈ sqrt(rows)` above 1M; `probes` in the 10–50 range.

### Distance operator — match to OpenAI (cosine)

pgvector operators: `<->` L2, `<=>` **cosine**, `<#>` negative inner product, `<+>` L1.

OpenAI `text-embedding-3-*` vectors are normalized to length 1, so **cosine (`<=>`, opclass `vector_cosine_ops`)** is the correct choice. (For unit vectors cosine and inner product rank identically; `<#>` is a valid faster alternative, but standardize on `<=>` for clarity.) The index opclass **must** match the query operator — a `vector_cosine_ops` index only accelerates `<=>`.

---

## 3. Query patterns

### KNN (Drizzle helper)

```typescript
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';

async function search(embedding: number[], limit = 8) {
  const similarity = sql<number>`1 - (${cosineDistance(items.embedding, embedding)})`;
  return db
    .select({ id: items.id, content: items.content, similarity })
    .from(items)
    .where(gt(similarity, 0.5))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);
}
```

### KNN + metadata filtering

Add ordinary `WHERE` predicates (equality, `jsonb` `->>`, etc.). With an ANN index, a restrictive filter can starve the K results; pgvector 0.8's **iterative index scans** fix this — the index keeps scanning until it has enough rows that pass the filter:

```sql
SET hnsw.iterative_scan = strict_order;   -- or relaxed_order for more speed
```

Alternative for very selective filters: a partial HNSW index (`... WHERE tenant_id = ...`) or a B-tree on the filter column.

### Hybrid search (pgvector + full-text) via Reciprocal Rank Fusion

Dense (`<=>`) captures semantics; sparse (`tsvector`) nails exact terms / proper nouns. RRF fuses by **rank position** (score-agnostic), so the two systems' incomparable scores don't need normalizing. Published results: pure vector ≈62% precision → +FTS+RRF ≈84%.

Add a generated `tsvector` + GIN index, then fuse in one raw-SQL query:

```sql
ALTER TABLE items ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX items_fts ON items USING gin (search_vector);
```

```sql
WITH fts AS (
  SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS r
  FROM items, websearch_to_tsquery('english', $1) q
  WHERE search_vector @@ q
  LIMIT 60
),
vec AS (
  SELECT id, row_number() OVER (ORDER BY embedding <=> $2::vector) AS r
  FROM items
  ORDER BY embedding <=> $2::vector
  LIMIT 60
),
fused AS (
  SELECT COALESCE(f.id, v.id) AS id,
         COALESCE(1.0/(60 + f.r), 0) + COALESCE(1.0/(60 + v.r), 0) AS score
  FROM fts f FULL OUTER JOIN vec v USING (id)
)
SELECT i.id, i.content, fused.score
FROM fused JOIN items i ON i.id = fused.id
ORDER BY fused.score DESC
LIMIT 20;
```

`60` is the RRF `k` constant (standard default). `$1` = raw query text, `$2` = query embedding. Run this through Drizzle's `sql` template or the driver. (If we later want BM25 specifically rather than `ts_rank_cd`, the ParadeDB `pg_search` extension is the Postgres-native option — but stock tsvector + RRF is enough to start.)

---

## 4. Migrations

Use **`drizzle-kit`** with SQL-file migrations, not `push`, for production:

```bash
bunx drizzle-kit generate   # diff schema -> versioned .sql in ./drizzle
bunx drizzle-kit migrate    # apply pending migrations
```

`drizzle.config.ts` uses `dialect: 'postgresql'`. Put `CREATE EXTENSION IF NOT EXISTS vector;` in the first migration.

**Known bug (must handle):** `drizzle-kit push` (and some `generate` paths) emit HNSW index DDL **without the operator class**, producing `USING hnsw ("embedding")` → Postgres error *"no default operator class for access method 'hnsw'"*. Reported May 2026 against drizzle-orm 0.45.2 / pgvector 0.7+, labeled *fixed-in-beta*. **Workaround (do this regardless):** write the vector index as **raw SQL inside the migration file**, not via the schema-declared index, so the opclass is explicit:

```sql
CREATE INDEX items_embedding_hnsw
  ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

Keep the `index(...).using('hnsw', ...op('vector_cosine_ops'))` in the schema for documentation/introspection, but treat the migration SQL as source of truth for the index.

---

## 5. Recommendation for D1 / D2

**D1 (data layer / schema + connection):**
- Depend on `postgres` (postgres.js) + `drizzle-orm` + `drizzle-kit`. Do **not** adopt `Bun.sql` or Prisma for the vector path.
- Create the Drizzle client via `drizzle-orm/postgres-js` over a single pooled `postgres()` instance (respect `DATABASE_URL`; set a sane `max` pool size for Bun/Hono).
- Schema: `vector('embedding', { dimensions: 1536 })`, plus `jsonb` metadata and a generated `tsvector` column for hybrid search.
- Migrations via `drizzle-kit generate`/`migrate`; first migration does `CREATE EXTENSION vector`; index DDL hand-written with `vector_cosine_ops` + HNSW params (bug workaround).

**D2 (retrieval / query API):**
- Default retrieval = **HNSW cosine KNN** using Drizzle's `cosineDistance`, returning `1 - distance` as similarity, with metadata `WHERE` filters.
- Set `hnsw.ef_search` (start ~100) per request/transaction to trade recall vs latency; enable `hnsw.iterative_scan` when filters are selective.
- Provide a **hybrid search** path (the RRF raw-SQL query in §3) behind the same retrieval interface for keyword-heavy queries; make dense-only vs hybrid a strategy toggle.
- Keep all vector SQL operators consistent with the index opclass (`<=>` ↔ `vector_cosine_ops`).

This gives Aulus a typed, migratable data layer with a clean escape hatch to raw SQL exactly where vector/hybrid work needs it.

---

## Sources

- pgvector — README (v0.8.6; operators, HNSW/IVFFlat syntax & defaults, OpenAI cosine, iterative scans): https://github.com/pgvector/pgvector
- pgvector 0.8.0 release (iterative index scans, filtering): https://www.postgresql.org/about/news/pgvector-080-released-2952/
- pgvector-node (serialization for Bun.sql, postgres.js, node-postgres, Drizzle): https://github.com/pgvector/pgvector-node
- `pgvector` npm (supported libraries incl. Bun SQL): https://www.npmjs.com/package/pgvector
- Drizzle — Vector similarity search guide (vector column, HNSW `vector_cosine_ops`, `cosineDistance`): https://orm.drizzle.team/docs/guides/vector-similarity-search
- Drizzle — PostgreSQL extensions (pgvector): https://orm.drizzle.team/docs/extensions/pg
- Drizzle v0.31.0 release notes (pgvector helpers history): https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0310
- Drizzle-kit HNSW opclass bug (drizzle-orm #5792): https://github.com/drizzle-team/drizzle-orm/issues/5792
- Bun — SQL / `Bun.sql` docs (v1.4; pooling, transactions, limitations, no extension helpers): https://bun.com/docs/runtime/sql
- Bun.sql vs postgres.js vs Drizzle (2026 stack overview): https://www.pkgpulse.com/guides/bun-sql-vs-postgres-js-vs-drizzle-postgres-stack-2026
- pgvector DBA guide, Part 2: Indexes (Mar 2026 update; HNSW/IVFFlat tuning): https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/
- IVFFlat vs HNSW — which to use: https://dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use-305p
- pgvector HNSW Postgres 18 production tuning (2026): https://nerdleveltech.com/pgvector-hnsw-postgres-18-production-tuning-tutorial
- Hybrid search with pgvector + full-text + RRF: https://dev.to/lpossamai/building-hybrid-search-for-rag-combining-pgvector-and-full-text-search-with-reciprocal-rank-fusion-6nk
- Hybrid search in PostgreSQL — the missing manual (ParadeDB / BM25 context): https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual
- Neon — pgvector docs: https://neon.com/docs/extensions/pgvector
