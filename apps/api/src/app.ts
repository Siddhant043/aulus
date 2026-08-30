import { Hono } from "hono";
import type { Providers } from "@aulus/ai";
import type { ChatStore, SkillContentStore, SourceRecord } from "@aulus/db";
import type { HealthResponse } from "@aulus/types";
import { registerChatRoutes } from "./chat-routes";
import { createSource, type SourceRoutesDeps } from "./create-source";
import { toSourceDto } from "./source-dto";
import {
  registerJobRoutes,
} from "./job-routes";
import {
  registerSkillContentRoutes,
} from "./skill-content-routes";

export type AppDeps = SourceRoutesDeps & {
  chatStore?: ChatStore;
  skillContentStore?: SkillContentStore;
  providers?: Providers;
};

export function createApp(deps?: AppDeps) {
  const app = new Hono();

  // A Source DTO needs its active ingest job id alongside its Video-derived
  // status; both read routes below share this resolution.
  const resolveSourceDto = async (
    d: SourceRoutesDeps,
    source: SourceRecord,
  ) => {
    const active = await d.store.findActiveIngestSourceJob(source.id);
    return toSourceDto(d.store, source, active?.id ?? null);
  };

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

  app.get("/api/sources", async (c) => {
    if (!deps) {
      return c.json({ error: "sources are not configured" }, 503);
    }
    const sources = await deps.store.listSources();
    const dtos = await Promise.all(
      sources.map((source) => resolveSourceDto(deps, source)),
    );
    return c.json(dtos);
  });

  app.get("/api/sources/:id", async (c) => {
    if (!deps) {
      return c.json({ error: "sources are not configured" }, 503);
    }
    const source = await deps.store.getSource(c.req.param("id"));
    if (!source) {
      return c.json({ error: "Source not found" }, 404);
    }
    return c.json(await resolveSourceDto(deps, source));
  });

  if (deps) {
    registerJobRoutes(app, deps.store);
  }

  if (deps?.chatStore && deps.providers) {
    registerChatRoutes(app, {
      store: deps.chatStore,
      providers: deps.providers,
    });
  }

  if (deps?.chatStore && deps.skillContentStore && deps.providers) {
    registerSkillContentRoutes(app, {
      store: deps.store,
      chatStore: deps.chatStore,
      skillContentStore: deps.skillContentStore,
      enqueueJob: deps.enqueueJob,
    });
  }

  return app;
}
