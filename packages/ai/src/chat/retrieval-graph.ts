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
  history: string;
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
  history: string,
  chunks: readonly RetrievedChunk[],
): Promise<RetrievedChunk[]> {
  const relevant: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const gradeText = await invokeFastModel(deps.providers, "chat.grade", {
      history,
      question,
      chunk: chunk.content,
    });
    if (parseGradeJson(gradeText)) {
      relevant.push(chunk);
    }
  }
  return relevant;
}

export type RetrieveSubgraphResult = {
  searchQuery: string;
  gradedChunks: RetrievedChunk[];
  contextChunks: RetrievedChunk[];
  rewriteCount: number;
};

/**
 * Shared retrieve → rerank → grade ⇄ rewrite → ±1-neighbor expand loop.
 * Used by Chat (after route=retrieve) and skill-content (per planned topic).
 */
export async function runRetrieveSubgraph(
  deps: RetrievalGraphDeps,
  input: {
    question: string;
    history: string;
    videoIds: readonly string[];
    searchQuery?: string;
  },
): Promise<RetrieveSubgraphResult> {
  const config = deps.retrievalConfig ?? DEFAULT_RETRIEVAL_CONFIG;
  let searchQuery = input.searchQuery ?? input.question;
  let rewriteCount = 0;
  let gradedChunks: RetrievedChunk[] = [];

  while (true) {
    const reranked = await retrieveAndRerank(deps, searchQuery, input.videoIds);
    gradedChunks = await gradeChunks(
      deps,
      input.question,
      input.history,
      reranked,
    );
    if (gradedChunks.length > 0 || rewriteCount >= config.maxRewrites) {
      break;
    }
    const rewritten = (
      await invokeFastModel(deps.providers, "chat.rewrite", {
        history: input.history,
        question: input.question,
      })
    ).trim();
    searchQuery = rewritten;
    rewriteCount += 1;
  }

  const videoIds = [...new Set(gradedChunks.map((chunk) => chunk.videoId))];
  const allVideoChunks =
    videoIds.length === 0
      ? []
      : await deps.store.listChunksForVideos(videoIds);

  return {
    searchQuery,
    gradedChunks,
    contextChunks: expandNeighborChunks(
      gradedChunks,
      groupChunksByVideo(allVideoChunks),
    ),
    rewriteCount,
  };
}

export function buildChatRetrievalGraph(deps: RetrievalGraphDeps) {
  const graph = new StateGraph(
    Annotation.Root({
      question: Annotation<string>,
      history: Annotation<string>,
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
        history: state.history,
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
    .addNode("retrieve_subgraph", async (state) => {
      const retrieved = await runRetrieveSubgraph(deps, {
        question: state.question,
        history: state.history,
        videoIds: state.videoIds,
        searchQuery: state.searchQuery,
      });
      return {
        searchQuery: retrieved.searchQuery,
        gradedChunks: retrieved.gradedChunks,
        contextChunks: retrieved.contextChunks,
        rewriteCount: retrieved.rewriteCount,
      };
    })
    .addEdge(START, "route_question")
    .addConditionalEdges("route_question", (state) =>
      state.route === "answer_directly" ? END : "retrieve_subgraph",
    )
    .addEdge("retrieve_subgraph", END)
    .compile();

  return graph;
}

export async function runRetrievalGraph(
  deps: RetrievalGraphDeps,
  input: Pick<RetrievalGraphState, "question" | "history" | "videoIds">,
): Promise<RetrievalGraphState> {
  const graph = buildChatRetrievalGraph(deps);
  return graph.invoke({
    question: input.question,
    history: input.history,
    searchQuery: input.question,
    videoIds: [...input.videoIds],
    route: null,
    gradedChunks: [],
    contextChunks: [],
    rewriteCount: 0,
  });
}
