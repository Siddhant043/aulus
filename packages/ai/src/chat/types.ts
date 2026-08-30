import type { CitationRef } from "@aulus/types";
import type { RetrievedChunk } from "@aulus/db";

export type ChatHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatGraphInput = {
  question: string;
  history: ChatHistoryMessage[];
  videoIds: readonly string[];
};

export type ChatGraphEvent =
  | { type: "status"; phase: string }
  | { type: "token"; text: string }
  | { type: "citations"; citations: CitationRef[] }
  | { type: "done"; rawAnswer: string; displayMarkdown: string }
  | { type: "error"; message: string };

export type RetrievalConfig = {
  poolSize: number;
  keepCount: number;
  maxRewrites: number;
};

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  poolSize: 30,
  keepCount: 6,
  maxRewrites: 1,
};

const EMPTY_HISTORY_PLACEHOLDER = "(none)";

export function formatHistoryForPrompt(
  history: readonly ChatHistoryMessage[],
): string {
  if (history.length === 0) {
    return EMPTY_HISTORY_PLACEHOLDER;
  }
  return history
    .map((message) => {
      const speaker =
        message.role === "user"
          ? "User"
          : message.role === "assistant"
            ? "Assistant"
            : "System";
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
}

export function formatChunksForPrompt(chunks: readonly RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[chunk:${chunk.id}] (${chunk.chapterTitle ?? "clip"})\n${chunk.content}`,
    )
    .join("\n\n");
}

export function parseRouteJson(content: string): "retrieve" | "answer_directly" {
  const trimmed = content.trim();
  try {
    const parsed = JSON.parse(trimmed) as { route?: string };
    if (parsed.route === "answer_directly") {
      return "answer_directly";
    }
  } catch {
    const lowered = trimmed.toLowerCase();
    if (lowered.includes("answer_directly")) {
      return "answer_directly";
    }
  }
  return "retrieve";
}

export function parseGradeJson(content: string): boolean {
  const trimmed = content.trim();
  try {
    const parsed = JSON.parse(trimmed) as { relevant?: boolean };
    return parsed.relevant === true;
  } catch {
    return /"relevant"\s*:\s*true/i.test(trimmed);
  }
}

export function messageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "object" && "content" in content) {
    return messageContentToString((content as { content: unknown }).content);
  }
  if (Array.isArray(content)) {
    return content.map((part) => messageContentToString(part)).join("");
  }
  if (
    typeof content === "object" &&
    "text" in content &&
    typeof (content as { text: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }
  return String(content);
}
