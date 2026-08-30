import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Source } from "@aulus/types";
import { createSource, listSources } from "../lib/api";

const sourcesKey = ["sources"] as const;

/**
 * Live Sources list. While any Source is still ingesting we poll so the
 * status pills advance without a manual refresh; once everything has settled
 * the interval switches off.
 */
export function useSourcesQuery(): UseQueryResult<Source[]> {
  return useQuery({
    queryKey: sourcesKey,
    queryFn: ({ signal }) => listSources(signal),
    refetchInterval: (query) => {
      const data = query.state.data;
      const stillIngesting = data?.some((s) => s.status === "ingesting");
      return stillIngesting ? 2500 : false;
    },
  });
}

export function useCreateSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => createSource(url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sourcesKey });
    },
  });
}
