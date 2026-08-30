import { Hono } from "hono";
import type { Providers } from "@aulus/ai";
import type { ChatStore } from "@aulus/db";
import type { HealthResponse } from "@aulus/types";
import { registerChatRoutes } from "./chat-routes";
import { createSource, type SourceRoutesDeps } from "./create-source";
import { toSourceDto } from "./source-dto";

export type AppDeps = SourceRoutesDeps & {
  chatStore?: ChatStore;
  providers?: Providers;
};

export function createApp(deps?: AppDeps) {
  const app = new Hono();

  app.get("/api/health", (c) => {
    const body = { status: "ok" } satisfies HealthResponse;
    return c.json(body);
  });

  app.post("/api/sources", async (c) => {
    if (!deps) {
      return c.json({ error: "sources are not configured" }, 503);
    }
    const raw = await c.req.json().catch(() => null);
    const result = await createSource(deps, raw);
    return c.json(result.body, result.status);
  });

  app.get("/api/sources/:id", async (c) => {
    if (!deps) {
      return c.json({ error: "sources are not configured" }, 503);
    }
    const source = await deps.store.getSource(c.req.param("id"));
    if (!source) {
      return c.json({ error: "Source not found" }, 404);
    }
    const active = await deps.store.findActiveIngestSourceJob(source.id);
    return c.json(await toSourceDto(deps.store, source, active?.id ?? null));
  });

  if (deps?.chatStore && deps.providers) {
    registerChatRoutes(app, {
      store: deps.chatStore,
      providers: deps.providers,
    });
  }

  return app;
}
