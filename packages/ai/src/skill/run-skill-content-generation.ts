import type { ChatStore, RetrievedChunk } from "@aulus/db";
import type { Providers } from "../init-providers";
import { runRetrieveSubgraph } from "../chat/retrieval-graph";
import {
  formatChunksForPrompt,
  messageContentToString,
  type RetrievalConfig,
} from "../chat/types";
import {
  assembleSkillContent,
  type AssembledSkillContent,
} from "./assemble";
import { parsePlanTopics } from "./plan-topics";

export type SkillContentRunnerDeps = {
  providers: Providers;
  store: ChatStore;
  retrievalConfig?: RetrievalConfig;
};

export type SkillContentInput = {
  focus: string;
  scopeSummary: string;
  videoIds: readonly string[];
};

export type SkillContentResult = AssembledSkillContent & {
  topics: string[];
  synthesizedMarkdown: string;
};

async function invokeModel(
  providers: Providers,
  model: "chat" | "fast",
  promptName: string,
  variables: Record<string, string>,
): Promise<string> {
  const prompt = await providers.prompts.get(promptName);
  const llm = model === "chat" ? providers.chatModel : providers.fastChatModel;
  const response = await prompt.pipe(llm).invoke(variables);
  return messageContentToString(
    (response as { content?: unknown }).content ?? response,
  );
}

function parseCriticJson(
  raw: string,
): { pass: true } | { pass: false; revisedMarkdown: string } {
  try {
    const parsed = JSON.parse(raw.trim()) as {
      pass?: boolean;
      revised_markdown?: string;
    };
    if (parsed.pass === true) {
      return { pass: true };
    }
    if (
      parsed.pass === false &&
      typeof parsed.revised_markdown === "string" &&
      parsed.revised_markdown.length > 0
    ) {
      return { pass: false, revisedMarkdown: parsed.revised_markdown };
    }
  } catch {
    // Treat unparseable critic output as pass to avoid blocking generation.
  }
  return { pass: true };
}

/**
 * plan → retrieve (shared subgraph per topic) → synthesize → assemble → critic
 * (one revise max). Citations only ever reference retrieved Chunk ids.
 */
export async function runSkillContentGeneration(
  deps: SkillContentRunnerDeps,
  input: SkillContentInput,
): Promise<SkillContentResult> {
  const focus = input.focus.trim();
  const planRaw = await invokeModel(deps.providers, "fast", "skill.plan", {
    focus: focus.length > 0 ? focus : "(none — general digest)",
    scope_summary: input.scopeSummary,
  });
  const topics = parsePlanTopics(planRaw);

  const synthesizedParts: string[] = [];
  const retrievedById = new Map<string, RetrievedChunk>();

  for (const topic of topics) {
    const retrieval = await runRetrieveSubgraph(
      {
        providers: deps.providers,
        store: deps.store,
        retrievalConfig: deps.retrievalConfig,
      },
      {
        question: topic,
        history: "(none)",
        videoIds: input.videoIds,
      },
    );

    for (const chunk of retrieval.contextChunks) {
      retrievedById.set(chunk.id, chunk);
    }

    const context = formatChunksForPrompt(retrieval.contextChunks);
    const part = await invokeModel(
      deps.providers,
      "chat",
      "skill.synthesize",
      {
        topic,
        focus: focus.length > 0 ? focus : "(none)",
        context: context.length > 0 ? context : "(no chunks retrieved)",
      },
    );
    synthesizedParts.push(part.trim());
  }

  const synthesizedMarkdown = synthesizedParts.filter(Boolean).join("\n\n");
  const assembled = assembleSkillContent(
    synthesizedMarkdown,
    new Set(retrievedById.keys()),
    retrievedById,
  );

  const criticRaw = await invokeModel(deps.providers, "fast", "skill.critic", {
    markdown: assembled.markdown,
  });
  const critique = parseCriticJson(criticRaw);
  if (!critique.pass) {
    // Critic may rewrite the body; never trust an LLM-written appendix —
    // re-resolve cites and force the bundled R4 template.
    const revisedBody = stripBestPracticesAppendix(critique.revisedMarkdown);
    const reassembled = assembleSkillContent(
      revisedBody,
      new Set(retrievedById.keys()),
      retrievedById,
    );
    return {
      ...reassembled,
      topics,
      synthesizedMarkdown,
    };
  }

  return {
    ...assembled,
    topics,
    synthesizedMarkdown,
  };
}

function stripBestPracticesAppendix(markdown: string): string {
  const marker = "<!-- AULUS SKILL-AUTHORING BEST PRACTICES";
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex >= 0) {
    return markdown.slice(0, markerIndex).replace(/\n---\n\s*$/, "").trimEnd();
  }
  const separator = "\n\n---\n\n";
  const separatorIndex = markdown.lastIndexOf(separator);
  if (separatorIndex >= 0) {
    return markdown.slice(0, separatorIndex).trimEnd();
  }
  return markdown.trimEnd();
}
