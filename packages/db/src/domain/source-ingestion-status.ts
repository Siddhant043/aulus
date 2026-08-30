import type { SourceIngestionStatus, IngestProgress } from "@aulus/types";

export type VideoStatusValue =
  | "discovered"
  | "pending_transcript"
  | "ready"
  | "unavailable"
  | "error";

export type SourceIngestionSnapshot = {
  status: SourceIngestionStatus;
  progress: IngestProgress;
};

/**
 * Derives a Source-level ingestion status from its Videos.
 * Pending/discovered Videos keep the Source in `ingesting`.
 */
export function sourceIngestionStatus(
  videoStatuses: readonly VideoStatusValue[],
): SourceIngestionSnapshot {
  const progress: IngestProgress = {
    discovered: 0,
    ready: 0,
    unavailable: 0,
    error: 0,
  };

  for (const status of videoStatuses) {
    switch (status) {
      case "discovered":
      case "pending_transcript":
        progress.discovered += 1;
        break;
      case "ready":
        progress.ready += 1;
        break;
      case "unavailable":
        progress.unavailable += 1;
        break;
      case "error":
        progress.error += 1;
        break;
    }
  }

  let status: SourceIngestionStatus;
  if (progress.discovered > 0 || videoStatuses.length === 0) {
    status = "ingesting";
  } else if (progress.ready > 0) {
    status = "ready";
  } else if (progress.error > 0) {
    status = "error";
  } else {
    status = "unavailable";
  }

  return { status, progress };
}
