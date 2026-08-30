import type { ChatScope, ScopeKind } from "@aulus/types";
import type { Scope } from "./domain/video-ids-for-scope";
import { nextSkillContentVersion } from "./domain/next-skill-content-version";

export type SkillContentArtifactRecord = {
  id: string;
  scopeKind: ScopeKind;
  sourceId: string | null;
  collectionId: string | null;
  version: number;
  markdown: string;
  bestPracticesTemplateVersion: string;
  modelStamps: Record<string, string>;
  generatedAt: Date;
};

export function scopeFromArtifact(
  artifact: SkillContentArtifactRecord,
): Scope {
  switch (artifact.scopeKind) {
    case "library":
      return { kind: "library" };
    case "source":
      return { kind: "source", sourceId: artifact.sourceId! };
    case "collection":
      return { kind: "collection", collectionId: artifact.collectionId! };
  }
}

export function scopeToArtifactColumns(scope: Scope | ChatScope): {
  scopeKind: ScopeKind;
  sourceId: string | null;
  collectionId: string | null;
} {
  switch (scope.kind) {
    case "library":
      return { scopeKind: "library", sourceId: null, collectionId: null };
    case "source":
      return {
        scopeKind: "source",
        sourceId: scope.sourceId,
        collectionId: null,
      };
    case "collection":
      return {
        scopeKind: "collection",
        sourceId: null,
        collectionId: scope.collectionId,
      };
  }
}

export function artifactMatchesScope(
  artifact: SkillContentArtifactRecord,
  scope: Scope | ChatScope,
): boolean {
  const columns = scopeToArtifactColumns(scope);
  return (
    artifact.scopeKind === columns.scopeKind &&
    artifact.sourceId === columns.sourceId &&
    artifact.collectionId === columns.collectionId
  );
}

export type SkillContentStore = {
  listArtifacts(scope: Scope | ChatScope): Promise<SkillContentArtifactRecord[]>;
  getArtifact(id: string): Promise<SkillContentArtifactRecord | undefined>;
  appendArtifact(input: {
    scope: Scope | ChatScope;
    markdown: string;
    bestPracticesTemplateVersion: string;
    modelStamps?: Record<string, string>;
  }): Promise<SkillContentArtifactRecord>;
};

export { nextSkillContentVersion };
