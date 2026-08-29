# Aulus

Turn YouTube into an agentic knowledge base.

Aulus is a self-hostable, open-source webapp where you add YouTube **videos,
channels, and playlists** and get two things back:

1. **An agentic RAG chatbot** that answers questions grounded in the transcripts,
   with citations back to the video and timestamp.
2. **A `skill-content.md` generator** — hand the file to a coding agent and say
   "create a skill based on this," and it has the content *and* the
   skill-authoring best-practices it needs.

## Status

🚧 **Planning.** The architecture is being charted in the open as GitHub issues.
See the [wayfinder map](../../issues?q=is%3Aissue+label%3Awayfinder%3Amap) for the
destination, the decisions made so far, and the open design tickets.

## Stack (planned)

- **Monorepo:** Turborepo + Bun
- **Backend:** Hono API + a background worker
- **Frontend:** React
- **AI:** LangChain + LangGraph (JS), provider-agnostic (Ollama in dev, hosted in
  prod), OpenAI embeddings, LangSmith tracing
- **Data:** Postgres + pgvector, redis-stack
- **Runtime:** Docker + docker-compose

## License

Not yet decided — the repo is public for collaboration; a license will be added
before first release.
