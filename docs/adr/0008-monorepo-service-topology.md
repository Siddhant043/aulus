# Monorepo and Docker service topology

Turborepo + Bun monorepo: `apps/web` (React/Vite), `apps/api` (Hono + SSE +
enqueue), `apps/worker` (BullMQ, Sync cron, yt-dlp). Shared packages
`@aulus/db`, `@aulus/ai`, `@aulus/config`, `@aulus/types`. Compose runs
`migrate`, `postgres` (pgvector), `redis-stack`, `api`, `worker`, `web` with
healthchecks; optional Ollama overlay. Root `.env.example` + same-origin
`/api` proxy. One-shot migrate service before api/worker start.
