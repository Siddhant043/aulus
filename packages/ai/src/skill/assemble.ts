import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveCitations,
  type RetrievedChunk,
} from "@aulus/db";
import type { CitationRef } from "@aulus/types";

export const BEST_PRACTICES_TEMPLATE_VERSION = "v0.1";

const templateDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

let cachedTemplate: string | undefined;

export function loadBestPracticesTemplate(): string {
  if (cachedTemplate === undefined) {
    cachedTemplate = readFileSync(
      join(templateDirectory, "best-practices-v0.1.md"),
      "utf8",
    ).trimEnd();
  }
  return cachedTemplate;
}

export type AssembledSkillContent = {
  markdown: string;
  citations: CitationRef[];
  bestPracticesTemplateVersion: string;
};

/**
 * Resolves [[chunk:uuid]] markers in the synthesized half, then appends the
 * static R4 best-practices appendix (never LLM-generated).
 */
export function assembleSkillContent(
  synthesizedMarkdown: string,
  allowedChunkIds: ReadonlySet<string>,
  chunksById: ReadonlyMap<string, RetrievedChunk>,
): AssembledSkillContent {
  const { displayMarkdown, citations } = resolveCitations(
    synthesizedMarkdown,
    allowedChunkIds,
    chunksById,
  );
  const appendix = loadBestPracticesTemplate();
  const markdown = `${displayMarkdown}\n\n---\n\n${appendix}\n`;
  return {
    markdown,
    citations,
    bestPracticesTemplateVersion: BEST_PRACTICES_TEMPLATE_VERSION,
  };
}
