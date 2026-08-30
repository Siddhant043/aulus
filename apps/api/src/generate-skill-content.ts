import type { ChatScope } from "@aulus/types";
import type { Scope } from "@aulus/db";
import {
  scopeFromChatScope,
  type ChatStore,
  type IngestStore,
  type JobKind,
  type SkillContentStore,
} from "@aulus/db";

export type GenerateSkillContentDeps = {
  store: IngestStore;
  chatStore: ChatStore;
  skillContentStore: SkillContentStore;
  enqueueJob: (kind: JobKind, jobId: string) => Promise<void>;
};

export async function enqueueSkillContentGeneration(
  deps: GenerateSkillContentDeps,
  input: { scope: ChatScope; focus?: string },
): Promise<
  | { ok: false; status: 400; error: string }
  | { ok: true; jobId: string }
> {
  const scope: Scope = scopeFromChatScope(input.scope);
  const readyCount = await deps.chatStore.countReadyVideosInScope(scope);
  if (readyCount === 0) {
    return {
      ok: false,
      status: 400,
      error: "Scope has no ready Videos",
    };
  }

  const focus = input.focus?.trim() ?? "";
  const job = await deps.store.createJob({
    kind: "generate_skill_content",
    sourceId: scope.kind === "source" ? scope.sourceId : null,
    progress: {
      scope: input.scope,
      focus,
      phase: "queued",
    },
  });
  await deps.enqueueJob("generate_skill_content", job.id);
  return { ok: true, jobId: job.id };
}
