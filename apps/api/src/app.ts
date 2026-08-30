import { Hono } from "hono";
import type { HealthResponse } from "@aulus/types";

export function createApp() {
  const app = new Hono();

  app.get("/api/health", (c) => {
    const body = { status: "ok" } satisfies HealthResponse;
    return c.json(body);
  });

  return app;
}
