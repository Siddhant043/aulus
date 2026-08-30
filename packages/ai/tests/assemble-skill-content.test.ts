import { describe, expect, test } from "bun:test";
import type { RetrievedChunk } from "@aulus/db";
import { youtubeDeepLink } from "@aulus/db";
import {
  BEST_PRACTICES_TEMPLATE_VERSION,
  assembleSkillContent,
  loadBestPracticesTemplate,
} from "../src/skill/assemble";

const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const chunk: RetrievedChunk = {
  id: chunkId,
  videoId: "11111111-1111-4111-8111-111111111111",
  youtubeVideoId: "abc123",
  chunkIndex: 0,
  content: "Rust ownership transfers at compile time",
  citeStartSec: 12,
  citeEndSec: 48,
  chapterTitle: "Ownership",
};

describe("assembleSkillContent", () => {
  test("resolves chunk markers and appends the static R4 v0.1 appendix", () => {
    const synthesized = `# Ownership\n\nTransfers at compile time [[chunk:${chunkId}]].`;
    const allowed = new Set([chunkId]);
    const byId = new Map([[chunkId, chunk]]);

    const result = assembleSkillContent(synthesized, allowed, byId);

    expect(result.bestPracticesTemplateVersion).toBe(
      BEST_PRACTICES_TEMPLATE_VERSION,
    );
    expect(result.markdown).toContain(
      `[Ownership](${youtubeDeepLink("abc123", 12)})`,
    );
    expect(result.markdown).not.toContain(`[[chunk:${chunkId}]]`);
    expect(result.markdown).toContain("\n\n---\n\n");
    expect(result.markdown).toContain(loadBestPracticesTemplate());
    expect(result.citations).toEqual([
      {
        videoId: chunk.videoId,
        youtubeVideoId: "abc123",
        citeStartSec: 12,
        citeEndSec: 48,
        chunkId,
      },
    ]);
  });

  test("drops unknown chunk markers from the synthesized half", () => {
    const unknownId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const result = assembleSkillContent(
      `Missing [[chunk:${unknownId}]]`,
      new Set([chunkId]),
      new Map([[chunkId, chunk]]),
    );

    expect(result.markdown.startsWith("Missing")).toBe(true);
    expect(result.citations).toEqual([]);
  });
});
