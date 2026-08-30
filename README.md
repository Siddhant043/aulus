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

The monorepo skeleton is in place (`apps/api`, `apps/worker`, `apps/web`,
`@aulus/config`, `@aulus/types`, `@aulus/db`). Feature work lands on this
topology.

## Bring-up

```bash
cp .env.example .env   # set OPENAI_API_KEY (required)
docker compose up --build
```

That starts postgres, redis-stack, a one-shot migrate, then api, worker, and
web. Health: `GET http://localhost:3000/api/health` and the UI on
`http://localhost:8080`.

Optional overlays:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up
```

Local turbo:

```bash
bun install
bun run dev          # api + worker + web
bun run test
bun run typecheck
bun run lint
bun run build
bun run db:migrate
```

## Stack

- **Monorepo:** Turborepo + Bun
- **Backend:** Hono API + a background worker
- **Frontend:** React + Vite (Workbench UI in a later ticket)
- **Validation:** Zod end-to-end (schemas shared frontend↔backend)
- **AI:** LangChain + LangGraph (JS), provider-agnostic (Ollama in dev, hosted in
  prod), OpenAI embeddings, LangSmith tracing
- **Data:** Postgres + pgvector, redis-stack
- **Runtime:** Docker + docker-compose

## License

Not yet decided — the repo is public for collaboration; a license will be added
before first release.
