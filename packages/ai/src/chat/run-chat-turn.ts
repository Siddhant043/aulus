import type { ChatStore } from "@aulus/db";
import { resolveCitations } from "@aulus/db";
import type { Providers } from "../init-providers";
import { runRetrievalGraph } from "./retrieval-graph";
import {
  formatChunksForPrompt,
  messageContentToString,
  type ChatGraphEvent,
  type ChatGraphInput,
  type RetrievalConfig,
} from "./types";

export type ChatRunnerDeps = {
  providers: Providers;
  store: ChatStore;
  retrievalConfig?: RetrievalConfig;
};

async function* streamChatModel(
  providers: Providers,
  promptName: string,
  variables: Record<string, string>,
): AsyncGenerator<string> {
  const prompt = await providers.prompts.get(promptName);
  const chain = prompt.pipe(providers.chatModel);
  const stream = await chain.stream(variables);
  for await (const chunk of stream) {
    const text = messageContentToString(
      (chunk as { content?: unknown }).content ?? chunk,
    );
    if (text.length > 0) {
      yield text;
    }
  }
}

export async function* runChatTurn(
  deps: ChatRunnerDeps,
  input: ChatGraphInput,
): AsyncGenerator<ChatGraphEvent> {
  try {
    yield { type: "status", phase: "routing" };
    const retrieval = await runRetrievalGraph(
      {
        providers: deps.providers,
        store: deps.store,
        retrievalConfig: deps.retrievalConfig,
      },
      { question: input.question, videoIds: [...input.videoIds] },
    );

    if (retrieval.route === "answer_directly") {
      yield { type: "status", phase: "answering" };
      let rawAnswer = "";
      for await (const token of streamChatModel(
        deps.providers,
        "chat.answer_directly",
        { question: input.question },
      )) {
        rawAnswer += token;
        yield { type: "token", text: token };
      }
      yield { type: "citations", citations: [] };
      yield {
        type: "done",
        rawAnswer,
        displayMarkdown: rawAnswer.trim(),
      };
      return;
    }

    const contextChunks = retrieval.contextChunks;
    yield { type: "status", phase: "generating" };
    const context = formatChunksForPrompt(contextChunks);
    let rawAnswer = "";
    for await (const token of streamChatModel(deps.providers, "chat.generate", {
      question: input.question,
      context,
    })) {
      rawAnswer += token;
      yield { type: "token", text: token };
    }

    const retrievedIds = new Set(contextChunks.map((chunk) => chunk.id));
    const chunksById = new Map(contextChunks.map((chunk) => [chunk.id, chunk]));
    const { displayMarkdown, citations } = resolveCitations(
      rawAnswer,
      retrievedIds,
      chunksById,
    );

    yield { type: "citations", citations };
    yield { type: "done", rawAnswer, displayMarkdown };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Chat generation failed";
    yield { type: "error", message };
  }
}
