import { Runnable } from "@langchain/core/runnables";
import type { Providers } from "@aulus/ai";
import { NoneReranker, PromptProvider } from "@aulus/ai";
import { messageContentToString } from "@aulus/ai";

type ScriptedResponse =
  | string
  | ((variables: Record<string, string>) => string | Promise<string>);

class ScriptedRunnable extends Runnable {
  lc_namespace = ["aulus", "test"];

  constructor(private readonly responder: ScriptedResponse) {
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

  private async respond(input: unknown): Promise<string> {
    const variables = this.inputToVariables(input);
    return typeof this.responder === "function"
      ? await this.responder(variables)
      : this.responder;
  }

  async invoke(input: unknown): Promise<{ content: string }> {
    return { content: await this.respond(input) };
  }

  async *_streamIterator(input: unknown): AsyncGenerator<{ content: string }> {
    yield { content: await this.respond(input) };
  }
}

export function createTestProviders(script: {
  route?: ScriptedResponse;
  grade?: ScriptedResponse;
  rewrite?: ScriptedResponse;
  generate?: ScriptedResponse;
  answerDirectly?: ScriptedResponse;
}): Providers {
  let fastCallCount = 0;

  return {
    chatModel: new ScriptedRunnable(
      script.generate ??
        script.answerDirectly ??
        "Grounded answer [[chunk:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]",
    ),
    fastChatModel: new ScriptedRunnable(async (variables) => {
      if ("chunk" in variables) {
        const grade = script.grade ?? '{"relevant":true}';
        return typeof grade === "function" ? await grade(variables) : grade;
      }

      if (fastCallCount === 0) {
        fastCallCount += 1;
        const route = script.route ?? '{"route":"retrieve"}';
        return typeof route === "function" ? await route(variables) : route;
      }

      const rewrite = script.rewrite ?? variables.question;
      return typeof rewrite === "function" ? await rewrite(variables) : rewrite;
    }),
    embeddings: {
      embedQuery: async () => Array.from({ length: 1536 }, () => 0),
    } as unknown as Providers["embeddings"],
    reranker: new NoneReranker(),
    prompts: new PromptProvider(),
  };
}
