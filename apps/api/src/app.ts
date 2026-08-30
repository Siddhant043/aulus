import { Hono } from "hono";
import type { HealthResponse } from "@aulus/types";
import { createSource, type SourceRoutesDeps } from "./create-source";
import { toSourceDto } from "./source-dto";

export function createApp(deps?: SourceRoutesDeps) {
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

  return app;
}
