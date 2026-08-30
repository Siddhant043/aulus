import type { ChatScope } from "@aulus/types";
import type { Scope } from "./domain/video-ids-for-scope";
import { nextSkillContentVersion } from "./domain/next-skill-content-version";
import {
  artifactMatchesScope,
  scopeToArtifactColumns,
  type SkillContentArtifactRecord,
  type SkillContentStore,
} from "./skill-content-store";

function newId(): string {
  return crypto.randomUUID();
}

/**
 * In-memory SkillContentStore for tests (seam ③/④ fixture).
 */
export function createMemorySkillContentStore(
  seed: readonly SkillContentArtifactRecord[] = [],
): SkillContentStore {
  const artifacts = new Map<string, SkillContentArtifactRecord>(
    seed.map((row) => [row.id, row]),
  );

  return {
    async listArtifacts(scope: Scope | ChatScope) {
      return [...artifacts.values()]
        .filter((row) => artifactMatchesScope(row, scope))
        .sort((left, right) => right.version - left.version);
    },

    async getArtifact(id) {
      return artifacts.get(id);
    },

    async appendArtifact(input) {
      const columns = scopeToArtifactColumns(input.scope);
      const existingVersions = [...artifacts.values()]
        .filter((row) => artifactMatchesScope(row, input.scope))
        .map((row) => row.version);
      const record: SkillContentArtifactRecord = {
        id: newId(),
        ...columns,
        version: nextSkillContentVersion(existingVersions),
        markdown: input.markdown,
        bestPracticesTemplateVersion: input.bestPracticesTemplateVersion,
        modelStamps: input.modelStamps ?? {},
        generatedAt: new Date(),
      };
      artifacts.set(record.id, record);
      return record;
    },
  };
}
