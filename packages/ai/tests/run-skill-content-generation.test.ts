import { describe, expect, test } from "bun:test";
import { Runnable } from "@langchain/core/runnables";
import { createMemoryChatStore, youtubeDeepLink } from "@aulus/db";
import { NoneReranker, PromptProvider } from "../src/index";
import { messageContentToString } from "../src/chat/types";
import {
  BEST_PRACTICES_TEMPLATE_VERSION,
  loadBestPracticesTemplate,
} from "../src/skill/assemble";
import { runSkillContentGeneration } from "../src/skill/run-skill-content-generation";

class ScriptedRunnable extends Runnable {
  lc_namespace = ["aulus", "test"];

  constructor(
    private readonly responder: (
      variables: Record<string, string>,
    ) => string | Promise<string>,
  ) {
    super();
  }

  private inputToVariables(input: unknown): Record<string, string> {
    const text = this.humanText(input);

    if (text.includes("Focus prompt:\n") && text.includes("Scope summary:\n")) {
      const focus =
        text.split("Focus prompt:\n")[1]?.split("\n\nScope summary:\n")[0] ?? "";
      const scope_summary = text.split("\n\nScope summary:\n")[1] ?? "";
      return { focus, scope_summary };
    }

    if (text.startsWith("Topic: ") || text.includes("\nFocus: ")) {
      const topic = text.split("Topic: ")[1]?.split("\nFocus: ")[0] ?? "";
      const rest = text.split("\nFocus: ")[1] ?? "";
      const focus = rest.split("\n\nChunks:\n")[0] ?? "";
      const context = rest.split("\n\nChunks:\n")[1] ?? "";
      return { topic, focus, context };
    }

    if (text.includes("Chunk:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nQuestion:\n")[0] ?? "";
      const rest = afterHistory.split("\n\nQuestion:\n")[1] ?? "";
      const question = rest.split("\n\nChunk:\n")[0] ?? "";
      const chunk = rest.split("\n\nChunk:\n")[1] ?? "";
      return { history, question, chunk };
    }

    if (text.includes("Question to rewrite:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nQuestion to rewrite:\n")[0] ?? "";
      const question = afterHistory.split("\n\nQuestion to rewrite:\n")[1] ?? "";
      return { history, question };
    }

    if (text.includes("Prior turns:\n") && text.includes("Current question:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nCurrent question:\n")[0] ?? "";
      const question = afterHistory.split("\n\nCurrent question:\n")[1] ?? "";
      return { history, question };
    }

    return { markdown: text };
  }

  private humanText(input: unknown): string {
    if (
      input !== null &&
      typeof input === "object" &&
      "messages" in input &&
      Array.isArray((input as { messages: unknown[] }).messages)
    ) {
      const messages = (input as { messages: unknown[] }).messages;
      const last = messages[messages.length - 1];
      return messageContentToString(last);
    }
    return messageContentToString(input);
  }

  async invoke(input: unknown): Promise<{ content: string }> {
    const variables = this.inputToVariables(input);
    return { content: await this.responder(variables) };
  }

  async *_streamIterator(input: unknown): AsyncGenerator<{ content: string }> {
    const variables = this.inputToVariables(input);
    yield { content: await this.responder(variables) };
  }
}

const sourceId = "22222222-2222-4222-8222-222222222222";
const videoId = "11111111-1111-4111-8111-111111111111";
const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("runSkillContentGeneration", () => {
  test("plans, retrieves, synthesizes, assembles appendix, and honors critic pass", async () => {
    const store = createMemoryChatStore({
      sourceVideos: [{ sourceId, videoId }],
      readyVideoIds: new Set([videoId]),
      chunks: [
        {
          id: chunkId,
          videoId,
          youtubeVideoId: "abc123",
          chunkIndex: 0,
          content: "Rust ownership transfers at compile time",
          citeStartSec: 12,
          citeEndSec: 48,
          chapterTitle: "Ownership",
        },
      ],
    });

    let criticCalls = 0;
    const providers = {
      chatModel: new ScriptedRunnable(async (variables) => {
        if ("topic" in variables) {
          return `## ${variables.topic}\n\nOwnership rule [[chunk:${chunkId}]]`;
        }
        return variables.markdown ?? "";
      }),
      fastChatModel: new ScriptedRunnable(async (variables) => {
        if ("chunk" in variables) {
          return '{"relevant":true}';
        }
        if ("focus" in variables && "scope_summary" in variables) {
          return JSON.stringify({
            topics: [
              "ownership",
              "borrowing",
              "lifetimes",
              "traits",
              "async",
              "macros",
            ],
          });
        }
        if ("markdown" in variables) {
          criticCalls += 1;
          return '{"pass":true}';
        }
        return variables.question ?? "";
      }),
      embeddings: {
        embedQuery: async () => Array.from({ length: 1536 }, () => 0),
      } as never,
      reranker: new NoneReranker(),
      prompts: new PromptProvider(),
    };

    const result = await runSkillContentGeneration(
      { providers, store },
      {
        focus: "ownership",
        scopeSummary: "1 ready Video about Rust",
        videoIds: [videoId],
      },
    );

    expect(result.topics).toEqual([
      "ownership",
      "borrowing",
      "lifetimes",
      "traits",
      "async",
    ]);
    expect(result.bestPracticesTemplateVersion).toBe(
      BEST_PRACTICES_TEMPLATE_VERSION,
    );
    expect(result.markdown).toContain(
      `[Ownership](${youtubeDeepLink("abc123", 12)})`,
    );
    expect(result.markdown).toContain(loadBestPracticesTemplate());
    expect(result.citations.every((citation) => citation.chunkId === chunkId)).toBe(
      true,
    );
    expect(criticCalls).toBe(1);
  });

  test("applies at most one critic revision", async () => {
    const store = createMemoryChatStore({
      sourceVideos: [{ sourceId, videoId }],
      readyVideoIds: new Set([videoId]),
      chunks: [
        {
          id: chunkId,
          videoId,
          youtubeVideoId: "abc123",
          chunkIndex: 0,
          content: "Rust ownership transfers at compile time",
          citeStartSec: 12,
          citeEndSec: 48,
          chapterTitle: "Ownership",
        },
      ],
    });

    let criticCalls = 0;
    const revised = `# Revised\n\nFinal body [[chunk:${chunkId}]]`;
    const providers = {
      chatModel: new ScriptedRunnable(async () => {
        return `## Draft\n\nBody [[chunk:${chunkId}]]`;
      }),
      fastChatModel: new ScriptedRunnable(async (variables) => {
        if ("chunk" in variables) {
          return '{"relevant":true}';
        }
        if ("focus" in variables && "scope_summary" in variables) {
          return '{"topics":["ownership"]}';
        }
        if ("markdown" in variables) {
          criticCalls += 1;
          if (criticCalls === 1) {
            return JSON.stringify({ pass: false, revised_markdown: revised });
          }
          return '{"pass":true}';
        }
        return variables.question ?? "";
      }),
      embeddings: {
        embedQuery: async () => Array.from({ length: 1536 }, () => 0),
      } as never,
      reranker: new NoneReranker(),
      prompts: new PromptProvider(),
    };

    const result = await runSkillContentGeneration(
      { providers, store },
      {
        focus: "",
        scopeSummary: "Rust video",
        videoIds: [videoId],
      },
    );

    expect(criticCalls).toBe(1);
    expect(result.markdown).toContain(
      `[Ownership](${youtubeDeepLink("abc123", 12)})`,
    );
    expect(result.markdown).toContain(loadBestPracticesTemplate());
    expect(result.markdown).not.toContain(`[[chunk:${chunkId}]]`);
  });
});
