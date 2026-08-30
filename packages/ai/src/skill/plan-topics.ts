export const MAX_SKILL_PLAN_TOPICS = 5;

export const DEFAULT_SKILL_DIGEST_TOPIC = "General skill-oriented digest";

/**
 * Parses planner JSON and caps topics at MAX_SKILL_PLAN_TOPICS.
 * Empty / invalid plans fall back to a single general digest topic.
 */
export function parsePlanTopics(raw: string): string[] {
  const topics = extractTopicStrings(raw)
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0)
    .slice(0, MAX_SKILL_PLAN_TOPICS);

  return topics.length > 0 ? topics : [DEFAULT_SKILL_DIGEST_TOPIC];
}

function extractTopicStrings(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw.trim()) as { topics?: unknown };
    if (!Array.isArray(parsed.topics)) {
      return [];
    }
    return parsed.topics.filter(
      (topic): topic is string => typeof topic === "string",
    );
  } catch {
    return [];
  }
}
