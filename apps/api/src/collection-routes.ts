import { Hono } from "hono";
import type { IngestStore } from "@aulus/db";
import {
  addCollectionSourceRequestSchema,
  createCollectionRequestSchema,
  renameCollectionRequestSchema,
} from "@aulus/types";
import { toCollectionDto } from "./collection-dto";

export function registerCollectionRoutes(
  app: Hono,
  store: IngestStore,
): void {
  app.post("/api/collections", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = createCollectionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "name is required" }, 400);
    }
    const collection = await store.createCollection({ name: parsed.data.name });
    return c.json(await toCollectionDto(store, collection), 201);
  });

  app.get("/api/collections", async (c) => {
    const collections = await store.listCollections();
    const dtos = await Promise.all(
      collections.map((collection) => toCollectionDto(store, collection)),
    );
    return c.json(dtos);
  });

  app.get("/api/collections/:id", async (c) => {
    const collection = await store.getCollection(c.req.param("id"));
    if (!collection) {
      return c.json({ error: "Collection not found" }, 404);
    }
    return c.json(await toCollectionDto(store, collection));
  });

  app.patch("/api/collections/:id", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = renameCollectionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "name is required" }, 400);
    }
    const renamed = await store.renameCollection(
      c.req.param("id"),
      parsed.data.name,
    );
    if (!renamed) {
      return c.json({ error: "Collection not found" }, 404);
    }
    return c.json(await toCollectionDto(store, renamed));
  });

  app.delete("/api/collections/:id", async (c) => {
    const deleted = await store.deleteCollection(c.req.param("id"));
    if (!deleted) {
      return c.json({ error: "Collection not found" }, 404);
    }
    return c.body(null, 204);
  });

  app.post("/api/collections/:id/sources", async (c) => {
    const collectionId = c.req.param("id");
    const collection = await store.getCollection(collectionId);
    if (!collection) {
      return c.json({ error: "Collection not found" }, 404);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = addCollectionSourceRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "sourceId is required" }, 400);
    }
    const source = await store.getSource(parsed.data.sourceId);
    if (!source) {
      return c.json({ error: "Source not found" }, 404);
    }
    await store.addSourceToCollection(collectionId, parsed.data.sourceId);
    return c.json(await toCollectionDto(store, collection));
  });

  app.delete("/api/collections/:id/sources/:sourceId", async (c) => {
    const removed = await store.removeSourceFromCollection(
      c.req.param("id"),
      c.req.param("sourceId"),
    );
    if (!removed) {
      return c.json({ error: "Collection membership not found" }, 404);
    }
    return c.body(null, 204);
  });
}
