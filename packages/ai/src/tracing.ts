import type { AppConfig } from "@aulus/config";

export function isTracingEnabled(config: AppConfig): boolean {
  return Boolean(config.LANGSMITH_TRACING && config.LANGSMITH_API_KEY);
}

export function applyTracingEnv(config: AppConfig): void {
  if (!isTracingEnabled(config)) {
    process.env.LANGSMITH_TRACING = "false";
    return;
  }
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = config.LANGSMITH_API_KEY;
  if (config.LANGSMITH_PROJECT) {
    process.env.LANGSMITH_PROJECT = config.LANGSMITH_PROJECT;
  }
  if (config.LANGSMITH_ENDPOINT) {
    process.env.LANGSMITH_ENDPOINT = config.LANGSMITH_ENDPOINT;
  }
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "true";
}
