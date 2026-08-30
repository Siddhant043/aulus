import { motion } from "framer-motion";
import type { Source } from "@aulus/types";
import { StatusBadge } from "../components/ui/status-badge";
import { AddSourceForm } from "./add-source-form";
import { useSourcesQuery } from "../queries/sources";
import { useUiStore } from "../stores/ui-store";
import { cn } from "../lib/cn";

const kindLabel: Record<Source["kind"], string> = {
  video: "Video",
  channel: "Channel",
  playlist: "Playlist",
};

function SourceRow({ source }: { source: Source }) {
  const selectedSourceId = useUiStore((s) => s.selectedSourceId);
  const selectSource = useUiStore((s) => s.selectSource);
  const selected = selectedSourceId === source.id;

  return (
    <motion.button
      layout
      type="button"
      onClick={() => selectSource(selected ? null : source.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
        "transition-colors",
        selected
          ? "border-accent bg-surface-2"
          : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            {kindLabel[source.kind]}
          </span>
          <span className="truncate text-sm font-medium text-text">
            {source.title ?? source.youtubeId}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted">
          {source.url}
        </p>
      </div>
      <StatusBadge source={source} />
    </motion.button>
  );
}

function SourcesPanel() {
  const query = useSourcesQuery();

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text">Sources</h2>
        <span className="font-mono text-xs text-muted tabular-nums">
          {query.data?.length ?? 0}
        </span>
      </header>

      <AddSourceForm />

      {query.isPending ? (
        <p className="text-sm text-muted">Loading Sources…</p>
      ) : query.isError ? (
        <p className="text-sm text-tone-error">
          Couldn't load Sources. Is the API running?
        </p>
      ) : query.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center">
          <p className="text-sm text-muted">
            No Sources yet. Paste a YouTube video, channel, or playlist link
            above to start ingesting.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {query.data.map((source) => (
            <SourceRow key={source.id} source={source} />
          ))}
        </div>
      )}
    </section>
  );
}

function CollectionsPanel() {
  // Collections group multiple Sources; they arrive with T7. The section is
  // first-class now so the Library extends cleanly once that lands.
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text">Collections</h2>
        <span className="font-mono text-xs text-muted tabular-nums">0</span>
      </header>
      <div className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center">
        <p className="text-sm text-muted">
          No Collections yet. Group Sources into a Collection to chat across
          all of them at once.
        </p>
      </div>
    </section>
  );
}

export function Library() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Library</h1>
        <p className="text-sm text-muted">
          Everything you've added, grouped by Source and Collection.
        </p>
      </div>
      <SourcesPanel />
      <CollectionsPanel />
    </div>
  );
}
