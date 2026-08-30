import { sql } from "drizzle-orm";
import type { Database } from "../client";
import type { RetrievedChunk } from "../chat-store";

const RRF_K = 60;

function rowToChunk(row: {
  id: string;
  video_id: string;
  youtube_video_id: string;
  chunk_index: number;
  content: string;
  cite_start_sec: number;
  cite_end_sec: number;
  chapter_title: string | null;
}): RetrievedChunk {
  return {
    id: row.id,
    videoId: row.video_id,
    youtubeVideoId: row.youtube_video_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    citeStartSec: row.cite_start_sec,
    citeEndSec: row.cite_end_sec,
    chapterTitle: row.chapter_title,
  };
}

export async function hybridSearchChunks(
  db: Database,
  input: {
    queryText: string;
    queryEmbedding: number[];
    videoIds: readonly string[];
    poolSize: number;
  },
): Promise<RetrievedChunk[]> {
  if (input.videoIds.length === 0) {
    return [];
  }

  const embeddingLiteral = `[${input.queryEmbedding.join(",")}]`;
  const result = await db.execute<{
    id: string;
    video_id: string;
    youtube_video_id: string;
    chunk_index: number;
    content: string;
    cite_start_sec: number;
    cite_end_sec: number;
    chapter_title: string | null;
  }>(sql`
    WITH fts AS (
      SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.search_vector, q) DESC) AS r
      FROM chunks c, websearch_to_tsquery('english', ${input.queryText}) q
      WHERE c.search_vector @@ q
        AND c.video_id = ANY(${sql.raw(
          `ARRAY[${input.videoIds.map((id) => `'${id}'::uuid`).join(",")}]`,
        )})
      LIMIT ${RRF_K}
    ),
    vec AS (
      SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${embeddingLiteral}::vector) AS r
      FROM chunks c
      WHERE c.video_id = ANY(${sql.raw(
        `ARRAY[${input.videoIds.map((id) => `'${id}'::uuid`).join(",")}]`,
      )})
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${RRF_K}
    ),
    fused AS (
      SELECT COALESCE(f.id, v.id) AS id,
             COALESCE(1.0 / (${RRF_K} + f.r), 0) + COALESCE(1.0 / (${RRF_K} + v.r), 0) AS score
      FROM fts f
      FULL OUTER JOIN vec v USING (id)
    )
    SELECT c.id,
           c.video_id,
           v.youtube_video_id,
           c.chunk_index,
           c.content,
           c.cite_start_sec,
           c.cite_end_sec,
           c.chapter_title
    FROM fused
    JOIN chunks c ON c.id = fused.id
    JOIN videos v ON v.id = c.video_id
    ORDER BY fused.score DESC
    LIMIT ${input.poolSize}
  `);

  return result.map(rowToChunk);
}
