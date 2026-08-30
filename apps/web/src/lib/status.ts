import type { Source } from "@aulus/types";

export type StatusTone = "ready" | "ingesting" | "unavailable" | "error";

export type StatusLabel = {
  tone: StatusTone;
  label: string;
};

/**
 * Derives the display pill for a Source's ingestion status.
 * The API already collapses per-Video state into a Source-level status +
 * progress counts (see @aulus/db sourceIngestionStatus); this only decides
 * how to render it. Pure so it can be unit-tested without the DOM.
 */
export function sourceStatusLabel(
  source: Pick<Source, "status" | "progress">,
): StatusLabel {
  const { progress } = source;
  const total =
    progress.discovered + progress.ready + progress.unavailable + progress.error;

  switch (source.status) {
    case "ready":
      return { tone: "ready", label: `Ready · ${progress.ready}` };
    case "ingesting":
      return {
        tone: "ingesting",
        label: total === 0 ? "Ingesting…" : `Ingesting ${progress.ready}/${total}`,
      };
    case "unavailable":
      return { tone: "unavailable", label: "Unavailable" };
    case "error":
      return { tone: "error", label: "Error" };
  }
}
