import type { CollectionRecord, IngestStore } from "@aulus/db";
import type { Collection } from "@aulus/types";

export async function toCollectionDto(
  store: IngestStore,
  collection: CollectionRecord,
): Promise<Collection> {
  const sourceIds = await store.listCollectionSourceIds(collection.id);
  return {
    id: collection.id,
    name: collection.name,
    sourceIds,
  };
}
