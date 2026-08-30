import { describe, expect, test } from "bun:test";
import { Runnable } from "@langchain/core/runnables";
import { createMemoryChatStore } from "@aulus/db";
import { NoneReranker, PromptProvider } from "../src/index";
import { runChatTurn } from "../src/chat/run-chat-turn";
import { messageContentToString } from "../src/chat/types";

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
    const text = messageContentToString(input);

    if (text.includes("Chunks:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nQuestion:\n")[0] ?? "";
      const rest = afterHistory.split("\n\nQuestion:\n")[1] ?? "";
      const question = rest.split("\n\nChunks:\n")[0] ?? "";
      const context = rest.split("\n\nChunks:\n")[1] ?? "";
      return { history, question, context };
    }

    if (text.includes("Chunk:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nQuestion:\n")[0] ?? "";
      const rest = afterHistory.split("\n\nQuestion:\n")[1] ?? "";
      const question = rest.split("\n\nChunk:\n")[0] ?? "";
      const chunk = rest.split("\n\nChunk:\n")[1] ?? "";
      return { history, question, chunk };
    }

    if (text.includes("Current question:\n")) {
      const afterHistory = text.split("Prior turns:\n")[1] ?? text;
      const history = afterHistory.split("\n\nCurrent question:\n")[0] ?? "";
      const question = afterHistory.split("\n\nCurrent question:\n")[1] ?? "";
      return { history, question };
    }

    return { question: text };
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

describe("runChatTurn", () => {
  test("resolves citations from retrieved chunks", async () => {
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

    let fastCallCount = 0;
    const providers = {
      chatModel: new ScriptedRunnable(
        async () => `Ownership is enforced [[chunk:${chunkId}]]`,
      ),
      fastChatModel: new ScriptedRunnable(async (variables) => {
        if ("chunk" in variables) {
          return '{"relevant":true}';
        }
        if (fastCallCount === 0) {
          fastCallCount += 1;
          return '{"route":"retrieve"}';
        }
        return variables.question;
      }),
      embeddings: {
        embedQuery: async () => Array.from({ length: 1536 }, () => 0),
      } as never,
      reranker: new NoneReranker(),
      prompts: new PromptProvider(),
    };

    const events = [];
    for await (const event of runChatTurn(
      { providers, store },
      {
        question: "How does ownership work?",
        history: [],
        videoIds: [videoId],
      },
    )) {
      events.push(event);
    }

    const citations = events.find((event) => event.type === "citations");
    expect(citations?.type).toBe("citations");
    if (citations?.type === "citations") {
      expect(citations.citations).toHaveLength(1);
      expect(citations.citations[0]?.youtubeVideoId).toBe("abc123");
    }
  });

  test("includes prior turns in the generate prompt", async () => {
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

    let capturedHistory = "";
    let fastCallCount = 0;
    const providers = {
      chatModel: new ScriptedRunnable(async (variables) => {
        capturedHistory = variables.history ?? "";
        return `Ownership is enforced [[chunk:${chunkId}]]`;
      }),
      fastChatModel: new ScriptedRunnable(async (variables) => {
        if ("chunk" in variables) {
          return '{"relevant":true}';
        }
        if (fastCallCount === 0) {
          fastCallCount += 1;
          return '{"route":"retrieve"}';
        }
        return variables.question;
      }),
      embeddings: {
        embedQuery: async () => Array.from({ length: 1536 }, () => 0),
      } as never,
      reranker: new NoneReranker(),
      prompts: new PromptProvider(),
    };

    for await (const event of runChatTurn(
      { providers, store },
      {
        question: "Tell me more",
        history: [
          { role: "user", content: "What is ownership?" },
          { role: "assistant", content: "Ownership is enforced at compile time." },
        ],
        videoIds: [videoId],
      },
    )) {
      if (event.type === "done") {
        break;
      }
    }

    expect(capturedHistory).toContain("User: What is ownership?");
    expect(capturedHistory).toContain(
      "Assistant: Ownership is enforced at compile time.",
    );
  });
});
