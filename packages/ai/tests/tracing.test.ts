import { describe, expect, test } from "bun:test";
import { loadConfig } from "@aulus/config";
import { isTracingEnabled } from "../src/tracing";

const validEnv = {
  DATABASE_URL: "postgres://aulus:aulus@localhost:5432/aulus",
  REDIS_URL: "redis://localhost:6379",
  OPENAI_API_KEY: "sk-test",
  LLM_PROVIDER: "openai",
};

describe("isTracingEnabled", () => {
  test("is off unless tracing is on and a LangSmith key is set", () => {
    expect(isTracingEnabled(loadConfig(validEnv))).toBe(false);
    expect(
      isTracingEnabled(
        loadConfig({ ...validEnv, LANGSMITH_TRACING: "true" }),
      ),
    ).toBe(false);
    expect(
      isTracingEnabled(
        loadConfig({
          ...validEnv,
          LANGSMITH_TRACING: "true",
          LANGSMITH_API_KEY: "lsv2-test",
        }),
      ),
    ).toBe(true);
  });
});
