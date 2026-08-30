import type { Hono } from "hono";
import {
  generateSkillContentRequestSchema,
  type ChatScope,
} from "@aulus/types";
import {
  scopeFromArtifact,
  type SkillContentArtifactRecord,
} from "@aulus/db";
import {
  enqueueSkillContentGeneration,
  type GenerateSkillContentDeps,
} from "./generate-skill-content";

function toArtifactDto(artifact: SkillContentArtifactRecord) {
  return {
    id: artifact.id,
    scope: scopeFromArtifact(artifact) as ChatScope,
    version: artifact.version,
    markdown: artifact.markdown,
    bestPracticesTemplateVersion: artifact.bestPracticesTemplateVersion,
    modelStamps: artifact.modelStamps,
    generatedAt: artifact.generatedAt.toISOString(),
  };
}

function parseScopeFromQuery(query: {
  kind?: string;
  sourceId?: string;
  collectionId?: string;
}): ChatScope | null {
  if (query.kind === "library") {
    return { kind: "library" };
  }
  if (query.kind === "source" && query.sourceId) {
    return { kind: "source", sourceId: query.sourceId };
  }
  if (query.kind === "collection" && query.collectionId) {
    return { kind: "collection", collectionId: query.collectionId };
  }
  return null;
}

export function registerSkillContentRoutes(
  app: Hono,
  deps: GenerateSkillContentDeps,
): void {
  app.post("/api/skill-content/generate", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = generateSkillContentRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid skill-content generate request" }, 400);
    }

    const result = await enqueueSkillContentGeneration(deps, parsed.data);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ jobId: result.jobId }, 202);
  });

  app.get("/api/skill-content", async (c) => {
    const scope = parseScopeFromQuery(c.req.query());
    if (!scope) {
      return c.json({ error: "Invalid Scope query" }, 400);
    }
    const artifacts = await deps.skillContentStore.listArtifacts(scope);
    return c.json(artifacts.map(toArtifactDto));
  });

  app.get("/api/skill-content/:id", async (c) => {
    const artifact = await deps.skillContentStore.getArtifact(c.req.param("id"));
    if (!artifact) {
      return c.json({ error: "skill-content version not found" }, 404);
    }
    return c.json(toArtifactDto(artifact));
  });

  app.get("/api/skill-content/:id/download", async (c) => {
    const artifact = await deps.skillContentStore.getArtifact(c.req.param("id"));
    if (!artifact) {
      return c.json({ error: "skill-content version not found" }, 404);
    }
    const filename = `skill-content-v${artifact.version}.md`;
    c.header("content-type", "text/markdown; charset=utf-8");
    c.header(
      "content-disposition",
      `attachment; filename="${filename}"`,
    );
    return c.body(artifact.markdown);
  });
}
