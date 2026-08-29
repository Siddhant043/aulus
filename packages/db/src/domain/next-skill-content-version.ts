/**
 * Next append-only skill-content.md version for a Scope (starts at 1).
 */
export function nextSkillContentVersion(
  existingVersions: readonly number[],
): number {
  if (existingVersions.length === 0) {
    return 1;
  }
  return Math.max(...existingVersions) + 1;
}
