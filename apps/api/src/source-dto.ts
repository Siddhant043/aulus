import type { IngestStore, SourceRecord } from "@aulus/db";
import { sourceIngestionStatus } from "@aulus/db";
import type { Source } from "@aulus/types";

export async function toSourceDto(
  store: IngestStore,
  source: SourceRecord,
  jobId: string | null,
): Promise<Source> {
  const videos = await store.listVideosForSource(source.id);
  const snapshot = sourceIngestionStatus(videos.map((video) => video.status));
  return {
    id: source.id,
    kind: source.kind,
    youtubeId: source.youtubeId,
    url: source.url,
    title: source.title,
    status: snapshot.status,
    jobId,
    progress: snapshot.progress,
  };
}
