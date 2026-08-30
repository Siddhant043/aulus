import { and, desc, eq, isNull } from "drizzle-orm";
import type { ChatScope } from "@aulus/types";
import type { Database } from "./client";
import type { Scope } from "./domain/video-ids-for-scope";
import { nextSkillContentVersion } from "./domain/next-skill-content-version";
import { skillContentArtifacts } from "./schema";
import {
  scopeToArtifactColumns,
  type SkillContentArtifactRecord,
  type SkillContentStore,
} from "./skill-content-store";

function artifactFromRow(
  row: typeof skillContentArtifacts.$inferSelect,
): SkillContentArtifactRecord {
  return {
    id: row.id,
    scopeKind: row.scopeKind,
    sourceId: row.sourceId,
    collectionId: row.collectionId,
    version: row.version,
    markdown: row.markdown,
    bestPracticesTemplateVersion: row.bestPracticesTemplateVersion,
    modelStamps: row.modelStamps,
    generatedAt: row.generatedAt,
  };
}

function scopeWhere(scope: Scope | ChatScope) {
  const columns = scopeToArtifactColumns(scope);
  switch (columns.scopeKind) {
    case "library":
      return and(
        eq(skillContentArtifacts.scopeKind, "library"),
        isNull(skillContentArtifacts.sourceId),
        isNull(skillContentArtifacts.collectionId),
      );
    case "source":
      return and(
        eq(skillContentArtifacts.scopeKind, "source"),
        eq(skillContentArtifacts.sourceId, columns.sourceId!),
        isNull(skillContentArtifacts.collectionId),
      );
    case "collection":
      return and(
        eq(skillContentArtifacts.scopeKind, "collection"),
        isNull(skillContentArtifacts.sourceId),
        eq(skillContentArtifacts.collectionId, columns.collectionId!),
      );
  }
}

export function createDrizzleSkillContentStore(db: Database): SkillContentStore {
  return {
    async listArtifacts(scope) {
      const rows = await db
        .select()
        .from(skillContentArtifacts)
        .where(scopeWhere(scope))
        .orderBy(desc(skillContentArtifacts.version));
      return rows.map(artifactFromRow);
    },

    async getArtifact(id) {
      const [row] = await db
        .select()
        .from(skillContentArtifacts)
        .where(eq(skillContentArtifacts.id, id))
        .limit(1);
      return row ? artifactFromRow(row) : undefined;
    },

    async appendArtifact(input) {
      const columns = scopeToArtifactColumns(input.scope);
      const existing = await db
        .select({ version: skillContentArtifacts.version })
        .from(skillContentArtifacts)
        .where(scopeWhere(input.scope));
      const version = nextSkillContentVersion(
        existing.map((row) => row.version),
      );
      const [row] = await db
        .insert(skillContentArtifacts)
        .values({
          ...columns,
          version,
          markdown: input.markdown,
          bestPracticesTemplateVersion: input.bestPracticesTemplateVersion,
          modelStamps: input.modelStamps ?? {},
        })
        .returning();
      return artifactFromRow(row!);
    },
  };
}
