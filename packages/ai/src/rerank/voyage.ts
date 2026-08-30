import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { DocumentInterface } from "@langchain/core/documents";

type VoyageRerankHit = {
  index: number;
  relevance_score: number;
};

type VoyageRerankResponse = {
  data: VoyageRerankHit[];
};

export class VoyageReranker extends BaseDocumentCompressor {
  constructor(
    private readonly apiKey: string,
    private readonly model = "rerank-2",
  ) {
    super();
  }

  async compressDocuments(
    documents: DocumentInterface[],
    query: string,
  ): Promise<DocumentInterface[]> {
    const response = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        documents: documents.map((document) => document.pageContent),
        model: this.model,
      }),
    });
    if (!response.ok) {
      throw new Error(`Voyage rerank failed: ${response.status}`);
    }
    const body = (await response.json()) as VoyageRerankResponse;
    return [...body.data]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((hit) => documents[hit.index]);
  }
}
