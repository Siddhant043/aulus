import { describe, expect, test } from "bun:test";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  chunks,
  collectionSources,
  collections,
  chats,
  chatMessages,
  jobs,
  skillContentArtifacts,
  sourceVideos,
  sources,
  transcripts,
  videos,
} from "../src/schema";

describe("D1 schema contract", () => {
  test("exports every agreed table", () => {
    const tableNames = [
      sources,
      videos,
      sourceVideos,
      collections,
      collectionSources,
      transcripts,
      chunks,
      jobs,
      chats,
      chatMessages,
      skillContentArtifacts,
    ].map(getTableName);

    expect(tableNames).toEqual([
      "sources",
      "videos",
      "source_videos",
      "collections",
      "collection_sources",
      "transcripts",
      "chunks",
      "jobs",
      "chats",
      "chat_messages",
      "skill_content_artifacts",
    ]);
  });

  test("chunks expose citation core spans distinct from full overlap window", () => {
    const columns = getTableColumns(chunks);
    expect(columns.startSec.name).toBe("start_sec");
    expect(columns.endSec.name).toBe("end_sec");
    expect(columns.citeStartSec.name).toBe("cite_start_sec");
    expect(columns.citeEndSec.name).toBe("cite_end_sec");
    expect(columns.embedding.name).toBe("embedding");
  });

  test("videos require a unique youtube video id business key", () => {
    const columns = getTableColumns(videos);
    expect(columns.youtubeVideoId.name).toBe("youtube_video_id");
    expect(columns.status.name).toBe("status");
  });

  test("transcripts store raw and normalized segments on the video", () => {
    const columns = getTableColumns(transcripts);
    expect(columns.segments.name).toBe("segments");
    expect(columns.normalizedSegments.name).toBe("normalized_segments");
  });

  test("skill-content artifacts are versioned per scope", () => {
    const columns = getTableColumns(skillContentArtifacts);
    expect(columns.version.name).toBe("version");
    expect(columns.markdown.name).toBe("markdown");
    expect(columns.scopeKind.name).toBe("scope_kind");
  });
});
