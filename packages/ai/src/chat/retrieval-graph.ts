import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";
import type { ChatStore, RetrievedChunk } from "@aulus/db";
import {
  expandNeighborChunks,
  groupChunksByVideo,
} from "@aulus/db";
import type { Providers } from "../init-providers";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  parseGradeJson,
  parseRouteJson,
  type RetrievalConfig,
} from "./types";

export type RetrievalGraphState = {
  question: string;
  searchQuery: string;
  videoIds: string[];
  route: "retrieve" | "answer_directly" | null;
  gradedChunks: RetrievedChunk[];
  contextChunks: RetrievedChunk[];
  rewriteCount: number;
};

export type RetrievalGraphDeps = {
  providers: Providers;
  store: ChatStore;
  retrievalConfig?: RetrievalConfig;
};

async function invokeFastModel(
  providers: Providers,
  promptName: string,
  variables: Record<string, string>,
): Promise<string> {
  const prompt = await providers.prompts.get(promptName);
  const chain = prompt.pipe(providers.fastChatModel);
  const response = await chain.invoke(variables);
  const content = (response as { content?: unknown }).content ?? response;
  return typeof content === "string" ? content : JSON.stringify(content);
}

async function retrieveAndRerank(
  deps: RetrievalGraphDeps,
  searchQuery: string,
  videoIds: readonly string[],
): Promise<RetrievedChunk[]> {
  const config = deps.retrievalConfig ?? DEFAULT_RETRIEVAL_CONFIG;
  const queryEmbedding = await deps.providers.embeddings.embedQuery(searchQuery);
  const pooled = await deps.store.hybridSearch({
    queryText: searchQuery,
    queryEmbedding,
    videoIds,
    poolSize: config.poolSize,
  });
  if (pooled.length === 0) {
    return [];
  }

  const documents = pooled.map(
    (chunk) =>
      new Document({
        pageContent: chunk.content,
        id: chunk.id,
        metadata: { chunk },
      }),
  );
  const reranked = await deps.providers.reranker.compressDocuments(
    documents,
    searchQuery,
  );
  return reranked
    .slice(0, config.keepCount)
    .map((document) => document.metadata.chunk as RetrievedChunk);
}

async function gradeChunks(
  deps: RetrievalGraphDeps,
  question: string,
  chunks: readonly RetrievedChunk[],
): Promise<RetrievedChunk[]> {
  const relevant: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const gradeText = await invokeFastModel(deps.providers, "chat.grade", {
      question,
      chunk: chunk.content,
    });
    if (parseGradeJson(gradeText)) {
      relevant.push(chunk);
    }
  }
  return relevant;
}

export function buildChatRetrievalGraph(deps: RetrievalGraphDeps) {
  const config = deps.retrievalConfig ?? DEFAULT_RETRIEVAL_CONFIG;

  const graph = new StateGraph(
    Annotation.Root({
      question: Annotation<string>,
      searchQuery: Annotation<string>,
      videoIds: Annotation<string[]>,
      route: Annotation<"retrieve" | "answer_directly" | null>,
      gradedChunks: Annotation<RetrievedChunk[]>,
      contextChunks: Annotation<RetrievedChunk[]>,
      rewriteCount: Annotation<number>,
    }),
  )
    .addNode("route_question", async (state) => {
      const routeText = await invokeFastModel(deps.providers, "chat.route", {
        question: state.question,
      });
      return {
        route: parseRouteJson(routeText),
        searchQuery: state.question,
        rewriteCount: 0,
        gradedChunks: [],
        contextChunks: [],
      };
    })
    .addNode("retrieve", async (state) => {
      const reranked = await retrieveAndRerank(
        deps,
        state.searchQuery,
        state.videoIds,
      );
      const gradedChunks = await gradeChunks(
        deps,
        state.question,
        reranked,
      );
      return { gradedChunks };
    })
    .addNode("rewrite", async (state) => {
      const rewritten = (
        await invokeFastModel(deps.providers, "chat.rewrite", {
          question: state.question,
        })
      ).trim();
      return {
        searchQuery: rewritten,
        rewriteCount: state.rewriteCount + 1,
      };
    })
    .addNode("expand", async (state) => {
      const videoIds = [...new Set(state.gradedChunks.map((chunk) => chunk.videoId))];
      const allVideoChunks = await deps.store.listChunksForVideos(videoIds);
      return {
        contextChunks: expandNeighborChunks(
          state.gradedChunks,
          groupChunksByVideo(allVideoChunks),
        ),
      };
    })
    .addEdge(START, "route_question")
    .addConditionalEdges("route_question", (state) =>
      state.route === "answer_directly" ? END : "retrieve",
    )
    .addConditionalEdges("retrieve", (state) => {
      if (state.gradedChunks.length > 0 || state.rewriteCount >= config.maxRewrites) {
        return "expand";
      }
      return "rewrite";
    })
    .addEdge("rewrite", "retrieve")
    .addEdge("expand", END)
    .compile();

  return graph;
}

export async function runRetrievalGraph(
  deps: RetrievalGraphDeps,
  input: Pick<RetrievalGraphState, "question" | "videoIds">,
): Promise<RetrievalGraphState> {
  const graph = buildChatRetrievalGraph(deps);
  return graph.invoke({
    question: input.question,
    searchQuery: input.question,
    videoIds: [...input.videoIds],
    route: null,
    gradedChunks: [],
    contextChunks: [],
    rewriteCount: 0,
  });
}
