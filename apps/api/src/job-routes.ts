import type { Hono } from "hono";
import type { IngestStore } from "@aulus/db";

export function registerJobRoutes(app: Hono, store: IngestStore): void {
  app.get("/api/jobs/:id", async (c) => {
    const job = await store.getJob(c.req.param("id"));
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }
    return c.json({
      id: job.id,
      kind: job.kind,
      status: job.status,
      sourceId: job.sourceId,
      videoId: job.videoId,
      progress: job.progress,
      error: job.error,
    });
  });
}
