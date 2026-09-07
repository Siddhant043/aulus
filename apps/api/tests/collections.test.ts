import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore } from "@aulus/db";
import { collectionSchema, collectionListResponseSchema } from "@aulus/types";
import { createApp } from "../src/app";

function appWithStore() {
  const store = createMemoryIngestStore();
  const app = createApp({ store, enqueueJob: async () => {} });
  return { app, store };
}

async function createSource(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
  });
  return ((await response.json()) as { id: string }).id;
}

describe("Collection CRUD routes", () => {
  test("creates a Collection grouping Sources", async () => {
    const { app } = appWithStore();
    const response = await app.request("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Rust" }),
    });
    expect(response.status).toBe(201);
    const body = collectionSchema.parse(await response.json());
    expect(body.name).toBe("Rust");
    expect(body.sourceIds).toEqual([]);
  });

  test("rejects an empty name with 400", async () => {
    const { app } = appWithStore();
    const response = await app.request("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(response.status).toBe(400);
  });

  test("lists Collections newest-first", async () => {
    const { app } = appWithStore();
    for (const name of ["a", "b"]) {
      await app.request("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }
    const response = await app.request("/api/collections");
    const body = collectionListResponseSchema.parse(await response.json());
    expect(body.map((c) => c.name)).toEqual(["b", "a"]);
  });

  test("renames a Collection", async () => {
    const { app } = appWithStore();
    const created = collectionSchema.parse(
      await (
        await app.request("/api/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "old" }),
        })
      ).json(),
    );
    const response = await app.request(`/api/collections/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "new" }),
    });
    expect(response.status).toBe(200);
    expect(collectionSchema.parse(await response.json()).name).toBe("new");
  });

  test("PATCH a missing Collection returns 404", async () => {
    const { app } = appWithStore();
    const response = await app.request(
      "/api/collections/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      },
    );
    expect(response.status).toBe(404);
  });

  test("adds and removes a Source, exposing members on the detail view", async () => {
    const { app } = appWithStore();
    const sourceId = await createSource(app);
    const created = collectionSchema.parse(
      await (
        await app.request("/api/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "c" }),
        })
      ).json(),
    );

    const add = await app.request(
      `/api/collections/${created.id}/sources`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId }),
      },
    );
    expect(add.status).toBe(200);
    expect(collectionSchema.parse(await add.json()).sourceIds).toEqual([
      sourceId,
    ]);

    const remove = await app.request(
      `/api/collections/${created.id}/sources/${sourceId}`,
      { method: "DELETE" },
    );
    expect(remove.status).toBe(204);

    const detail = collectionSchema.parse(
      await (await app.request(`/api/collections/${created.id}`)).json(),
    );
    expect(detail.sourceIds).toEqual([]);
  });

  test("adding a missing Source returns 404", async () => {
    const { app } = appWithStore();
    const created = collectionSchema.parse(
      await (
        await app.request("/api/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "c" }),
        })
      ).json(),
    );
    const response = await app.request(
      `/api/collections/${created.id}/sources`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId: "00000000-0000-0000-0000-000000000000",
        }),
      },
    );
    expect(response.status).toBe(404);
  });

  test("deletes a Collection", async () => {
    const { app } = appWithStore();
    const created = collectionSchema.parse(
      await (
        await app.request("/api/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "c" }),
        })
      ).json(),
    );
    const response = await app.request(`/api/collections/${created.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect((await app.request(`/api/collections/${created.id}`)).status).toBe(
      404,
    );
  });
});

describe("DELETE /api/sources/:id (orphan rule)", () => {
  test("removes a Source and drops it from Collections", async () => {
    const { app } = appWithStore();
    const sourceId = await createSource(app);
    const created = collectionSchema.parse(
      await (
        await app.request("/api/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "c" }),
        })
      ).json(),
    );
    await app.request(`/api/collections/${created.id}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId }),
    });

    const del = await app.request(`/api/sources/${sourceId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    expect((await app.request(`/api/sources/${sourceId}`)).status).toBe(404);

    const detail = collectionSchema.parse(
      await (await app.request(`/api/collections/${created.id}`)).json(),
    );
    expect(detail.sourceIds).toEqual([]);
  });

  test("DELETE a missing Source returns 404", async () => {
    const { app } = appWithStore();
    const response = await app.request(
      "/api/sources/00000000-0000-0000-0000-000000000000",
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
