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
    if (text.includes("Chunk:\n")) {
      const question = text.split("Question:\n")[1]?.split("\n\nChunk:\n")[0] ?? "";
      const chunk = text.split("\n\nChunk:\n")[1] ?? "";
      return { question, chunk };
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
});
