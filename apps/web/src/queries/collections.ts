import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Collection } from "@aulus/types";
import { listCollections } from "../lib/api";

export function useCollectionsQuery(): UseQueryResult<Collection[]> {
  return useQuery({
    queryKey: ["collections"],
    queryFn: ({ signal }) => listCollections(signal),
  });
}
