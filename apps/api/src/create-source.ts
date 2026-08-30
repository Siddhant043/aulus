import {
  parseYoutubeUrl,
  YoutubeUrlError,
  createSourceRequestSchema,
} from "@aulus/types";
import type { IngestStore, JobKind } from "@aulus/db";
import { toSourceDto } from "./source-dto";

export type EnqueueJob = (kind: JobKind, jobId: string) => Promise<void>;

export type SourceRoutesDeps = {
  store: IngestStore;
  enqueueJob: EnqueueJob;
};

export async function createSource(
  deps: SourceRoutesDeps,
  rawBody: unknown,
): Promise<{ status: 200 | 201 | 400; body: unknown }> {
  const parsed = createSourceRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "url is required" } };
  }

  let youtube;
  try {
    youtube = parseYoutubeUrl(parsed.data.url);
  } catch (error) {
    const message =
      error instanceof YoutubeUrlError
        ? error.message
        : "Invalid YouTube URL";
    return { status: 400, body: { error: message } };
  }

  const existing = await deps.store.findSourceByKindAndYoutubeId(
    youtube.kind,
    youtube.youtubeId,
  );
  if (existing) {
    const active = await deps.store.findActiveIngestSourceJob(existing.id);
    return {
      status: 200,
      body: await toSourceDto(deps.store, existing, active?.id ?? null),
    };
  }

  const source = await deps.store.createSource({
    kind: youtube.kind,
    youtubeId: youtube.youtubeId,
    url: youtube.canonicalUrl,
  });
  const job = await deps.store.createJob({
    kind: "ingest_source",
    sourceId: source.id,
  });
  await deps.enqueueJob("ingest_source", job.id);
  return {
    status: 201,
    body: await toSourceDto(deps.store, source, job.id),
  };
}
