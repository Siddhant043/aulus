import { describe, expect, test } from "bun:test";
import { Runnable } from "@langchain/core/runnables";
import type { Providers } from "@aulus/ai";
import {
  NoneReranker,
  PromptProvider,
  messageContentToString,
} from "@aulus/ai";
import {
  createMemoryChatStore,
  createMemoryIngestStore,
  createMemorySkillContentStore,
} from "@aulus/db";
import { handleGenerateSkillContent } from "../src/skill/generate-skill-content";

class ScriptedRunnable extends Runnable {
  lc_namespace = ["aulus", "test"];

  constructor(
    private readonly responder: (
      variables: Record<string, string>,
    ) => string | Promise<string>,
  ) {
    super();
  }

  private humanText(input: unknown): string {
    if (
      input !== null &&
      typeof input === "object" &&
      "messages" in input &&
      Array.isArray((input as { messages: unknown[] }).messages)
    ) {
      const messages = (input as { messages: unknown[] }).messages;
      return messageContentToString(messages[messages.length - 1]);
    }
    return messageContentToString(input);
  }

  private inputToVariables(input: unknown): Record<string, string> {
    const text = this.humanText(input);
    if (text.includes("Focus prompt:\n") && text.includes("Scope summary:\n")) {
      return {
        focus: text.split("Focus prompt:\n")[1]?.split("\n\nScope summary:\n")[0] ?? "",
        scope_summary: text.split("\n\nScope summary:\n")[1] ?? "",
      };
    }
    if (text.includes("Chunk:\n")) {
      return { chunk: "x", question: "q", history: "" };
    }
    if (text.startsWith("Topic: ") || text.includes("\nFocus: ")) {
      const topic = text.split("Topic: ")[1]?.split("\nFocus: ")[0] ?? "";
      return { topic, focus: "", context: "" };
    }
    return { markdown: text };
  }

  async invoke(input: unknown): Promise<{ content: string }> {
    return { content: await this.responder(this.inputToVariables(input)) };
  }
}

const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const videoId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";

function createProviders(): Providers {
  return {
    chatModel: new ScriptedRunnable(async (variables) => {
      if ("topic" in variables) {
        return `## ${variables.topic}\n\nRule [[chunk:${chunkId}]]`;
      }
      return variables.markdown ?? "";
    }),
    fastChatModel: new ScriptedRunnable(async (variables) => {
      if ("chunk" in variables) {
        return '{"relevant":true}';
      }
      if ("focus" in variables && "scope_summary" in variables) {
        return '{"topics":["ownership"]}';
      }
      if ("markdown" in variables) {
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
}

describe("handleGenerateSkillContent", () => {
  test("appends an immutable skill-content version and leaves priors fetchable", async () => {
    const ingestStore = createMemoryIngestStore();
    const chatStore = createMemoryChatStore({
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
    const skillContentStore = createMemorySkillContentStore();
    await skillContentStore.appendArtifact({
      scope: { kind: "source", sourceId },
      markdown: "# prior\n",
      bestPracticesTemplateVersion: "v0.1",
    });

    const job = await ingestStore.createJob({
      kind: "generate_skill_content",
      sourceId,
      progress: {
        scope: { kind: "source", sourceId },
        focus: "ownership",
        phase: "queued",
      },
    });

    await handleGenerateSkillContent(
      {
        ingestStore,
        chatStore,
        skillContentStore,
        providers: createProviders(),
      },
      job.id,
    );

    const updated = await ingestStore.getJob(job.id);
    expect(updated?.status).toBe("succeeded");

    const versions = await skillContentStore.listArtifacts({
      kind: "source",
      sourceId,
    });
    expect(versions.map((row) => row.version)).toEqual([2, 1]);
    expect(versions[1]?.markdown).toBe("# prior\n");
    expect(versions[0]?.markdown).toContain("Ownership");
    expect(versions[0]?.markdown).toContain("youtu.be/abc123?t=12");
    expect(versions[0]?.bestPracticesTemplateVersion).toBe("v0.1");

    const progress = updated?.progress as {
      artifactId?: string;
      phase?: string;
    };
    expect(progress.artifactId).toBe(versions[0]?.id);
    expect(progress.phase).toBe("done");
  });
});
