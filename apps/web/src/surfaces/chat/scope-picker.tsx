import { useState } from "react";
import type { ChatScope } from "@aulus/types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { useSourcesQuery } from "../../queries/sources";
import { useCollectionsQuery } from "../../queries/collections";

type ScopeKind = ChatScope["kind"];

const kindTabs: { kind: ScopeKind; label: string }[] = [
  { kind: "library", label: "Library" },
  { kind: "source", label: "Source" },
  { kind: "collection", label: "Collection" },
];

/**
 * Sets a new Chat's Scope at create time — Library (everything), a single
 * Source, or a Collection. Scope is fixed once the Chat exists.
 */
export function ScopePicker({
  onCreate,
  pending,
  error,
}: {
  onCreate: (scope: ChatScope) => void;
  pending: boolean;
  error?: string | null;
}) {
  const [kind, setKind] = useState<ScopeKind>("library");
  const [sourceId, setSourceId] = useState<string>("");
  const [collectionId, setCollectionId] = useState<string>("");
  const sources = useSourcesQuery();
  const collections = useCollectionsQuery();

  const scope: ChatScope | null =
    kind === "library"
      ? { kind: "library" }
      : kind === "source"
        ? sourceId
          ? { kind: "source", sourceId }
          : null
        : collectionId
          ? { kind: "collection", collectionId }
          : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">New chat</h2>
        <p className="text-xs text-muted">
          Choose what to ground the answers in. Scope is fixed for the chat.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
        {kindTabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            onClick={() => setKind(tab.kind)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              kind === tab.kind
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {kind === "source" && (
        <select
          aria-label="Source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text"
        >
          <option value="">Select a Source…</option>
          {(sources.data ?? []).map((source) => (
            <option key={source.id} value={source.id}>
              {source.title ?? source.youtubeId}
            </option>
          ))}
        </select>
      )}

      {kind === "collection" && (
        <select
          aria-label="Collection"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-text"
        >
          <option value="">Select a Collection…</option>
          {(collections.data ?? []).map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      )}

      <Button
        type="button"
        disabled={pending || scope === null}
        onClick={() => scope && onCreate(scope)}
      >
        {pending ? "Starting…" : "Start chat"}
      </Button>

      {error && (
        <p className="text-xs text-tone-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
