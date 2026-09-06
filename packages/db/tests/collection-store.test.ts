import { describe, expect, test } from "bun:test";
import { createMemoryIngestStore } from "@aulus/db";

async function seedSource(store: ReturnType<typeof createMemoryIngestStore>) {
  return store.createSource({
    kind: "video",
    youtubeId: crypto.randomUUID().slice(0, 11),
    url: "https://youtu.be/x",
  });
}

describe("Collection CRUD (IngestStore)", () => {
  test("creates, lists (newest first), and reads a Collection", async () => {
    const store = createMemoryIngestStore();
    const first = await store.createCollection({ name: "Rust" });
    const second = await store.createCollection({ name: "Go" });

    expect(first.name).toBe("Rust");
    const list = await store.listCollections();
    expect(list.map((c) => c.id)).toEqual([second.id, first.id]);
    expect((await store.getCollection(first.id))?.name).toBe("Rust");
    expect(await store.getCollection("missing")).toBeUndefined();
  });

  test("renames a Collection and reports missing ones", async () => {
    const store = createMemoryIngestStore();
    const collection = await store.createCollection({ name: "old" });
    const renamed = await store.renameCollection(collection.id, "new");
    expect(renamed?.name).toBe("new");
    expect(await store.renameCollection("missing", "x")).toBeUndefined();
  });

  test("adds/removes Sources idempotently and lists members", async () => {
    const store = createMemoryIngestStore();
    const collection = await store.createCollection({ name: "c" });
    const source = await seedSource(store);

    await store.addSourceToCollection(collection.id, source.id);
    await store.addSourceToCollection(collection.id, source.id); // idempotent
    expect(await store.listCollectionSourceIds(collection.id)).toEqual([
      source.id,
    ]);

    expect(
      await store.removeSourceFromCollection(collection.id, source.id),
    ).toBe(true);
    expect(await store.listCollectionSourceIds(collection.id)).toEqual([]);
    expect(
      await store.removeSourceFromCollection(collection.id, source.id),
    ).toBe(false);
  });

  test("deleting a Collection removes its membership rows", async () => {
    const store = createMemoryIngestStore();
    const collection = await store.createCollection({ name: "c" });
    const source = await seedSource(store);
    await store.addSourceToCollection(collection.id, source.id);

    expect(await store.deleteCollection(collection.id)).toBe(true);
    expect(await store.getCollection(collection.id)).toBeUndefined();
    expect(await store.deleteCollection(collection.id)).toBe(false);
  });
});

describe("deleteSource orphan rule (AC4)", () => {
  test("drops a Source and orphans only Videos no other Source references", async () => {
    const store = createMemoryIngestStore();
    const sourceA = await seedSource(store);
    const sourceB = await seedSource(store);
    const shared = await store.upsertVideo({ youtubeVideoId: "shared11aaa" });
    const soloA = await store.upsertVideo({ youtubeVideoId: "soloA11bbbb" });

    await store.ensureSourceVideo(sourceA.id, shared.id);
    await store.ensureSourceVideo(sourceB.id, shared.id);
    await store.ensureSourceVideo(sourceA.id, soloA.id);

    const removed = await store.deleteSource(sourceA.id);
    expect(removed).toBe(true);

    // Source A gone; its solo Video GC'd; shared Video kept (still on B).
    expect(await store.getSource(sourceA.id)).toBeUndefined();
    expect(await store.getVideo(soloA.id)).toBeUndefined();
    expect(await store.getVideo(shared.id)).toBeDefined();
    expect(
      (await store.listVideosForSource(sourceB.id)).map((v) => v.id),
    ).toEqual([shared.id]);
    expect(await store.deleteSource(sourceA.id)).toBe(false);
  });

  test("removes a deleted Source from any Collection it belonged to", async () => {
    const store = createMemoryIngestStore();
    const collection = await store.createCollection({ name: "c" });
    const source = await seedSource(store);
    await store.addSourceToCollection(collection.id, source.id);

    await store.deleteSource(source.id);
    expect(await store.listCollectionSourceIds(collection.id)).toEqual([]);
  });
});
