import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { DocumentInterface } from "@langchain/core/documents";

/** Identity reranker: keeps RRF order for self-host (RERANKER=none). */
export class NoneReranker extends BaseDocumentCompressor {
  async compressDocuments(
    documents: DocumentInterface[],
    query: string,
  ): Promise<DocumentInterface[]> {
    void query;
    return documents;
  }
}
