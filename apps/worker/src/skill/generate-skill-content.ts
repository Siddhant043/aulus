import type { Providers } from "@aulus/ai";
import { runSkillContentGeneration } from "@aulus/ai";
import {
  scopeFromChatScope,
  videoIdsForScope,
  type ChatStore,
  type IngestStore,
  type SkillContentStore,
} from "@aulus/db";
import type { ChatScope } from "@aulus/types";

export type GenerateSkillContentDeps = {
  ingestStore: IngestStore;
  chatStore: ChatStore;
  skillContentStore: SkillContentStore;
  providers: Providers;
};

function readJobScope(progress: Record<string, unknown>): {
  scope: ChatScope;
  focus: string;
} {
  const scope = progress.scope as ChatScope | undefined;
  if (!scope || typeof scope !== "object" || !("kind" in scope)) {
    throw new Error("generate_skill_content job missing scope in progress");
  }
  const focus = typeof progress.focus === "string" ? progress.focus : "";
  return { scope, focus };
}

/**
 * Worker handler for generate_skill_content Jobs.
 * Runs the skill-content graph and appends an immutable artifact version.
 */
export async function handleGenerateSkillContent(
  deps: GenerateSkillContentDeps,
  jobId: string,
): Promise<void> {
  const job = await deps.ingestStore.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  if (job.kind !== "generate_skill_content") {
    throw new Error(`Job ${jobId} is ${job.kind}, expected generate_skill_content`);
  }

  const progress = { ...(job.progress as Record<string, unknown>) };
  const { scope, focus } = readJobScope(progress);

  await deps.ingestStore.updateJob(jobId, {
    status: "running",
    progress: { ...progress, phase: "running" },
  });

  try {
    const domainScope = scopeFromChatScope(scope);
    const membership = await deps.chatStore.getMembershipSnapshot();
    const videoIds = [...videoIdsForScope(domainScope, membership)];
    const readyCount = await deps.chatStore.countReadyVideosInScope(domainScope);
    if (readyCount === 0) {
      throw new Error("Scope has no ready Videos");
    }

    const result = await runSkillContentGeneration(
      {
        providers: deps.providers,
        store: deps.chatStore,
      },
      {
        focus,
        scopeSummary: `${readyCount} ready Video(s) in Scope`,
        videoIds,
      },
    );

    const artifact = await deps.skillContentStore.appendArtifact({
      scope,
      markdown: result.markdown,
      bestPracticesTemplateVersion: result.bestPracticesTemplateVersion,
      modelStamps: {},
    });

    await deps.ingestStore.updateJob(jobId, {
      status: "succeeded",
      progress: {
        ...progress,
        phase: "done",
        artifactId: artifact.id,
        version: artifact.version,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "skill-content generation failed";
    await deps.ingestStore.updateJob(jobId, {
      status: "failed",
      error: { message },
      progress: { ...progress, phase: "failed" },
    });
    throw error;
  }
}
