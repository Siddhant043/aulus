import type { JobKind } from "@aulus/db";

export type EnqueueJob = (kind: JobKind, jobId: string) => Promise<void>;
