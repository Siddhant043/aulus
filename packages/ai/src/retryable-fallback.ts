import { Runnable, type RunnableConfig } from "@langchain/core/runnables";

function statusFromError(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const withStatus = error as { status?: unknown; cause?: { status?: unknown } };
  if (typeof withStatus.status === "number") {
    return withStatus.status;
  }
  if (typeof withStatus.cause?.status === "number") {
    return withStatus.cause.status;
  }
  return undefined;
}

export function isRetryableLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const status = statusFromError(error);
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }
  return /timeout/i.test(error.message);
}

export function withRetryableFallbacks(
  primary: Runnable,
  fallback: Runnable,
): Runnable {
  return new RetryableFallbackRunnable(primary, fallback);
}

class RetryableFallbackRunnable extends Runnable {
  lc_namespace = ["aulus", "ai"];

  constructor(
    private readonly primary: Runnable,
    private readonly fallback: Runnable,
  ) {
    super();
  }

  async invoke(input: unknown, options?: Partial<RunnableConfig>): Promise<unknown> {
    try {
      return await this.primary.invoke(input, options);
    } catch (error) {
      if (!isRetryableLlmError(error)) {
        throw error;
      }
      return await this.fallback.invoke(input, options);
    }
  }

  async *_streamIterator(
    input: unknown,
    options?: Partial<RunnableConfig>,
  ): AsyncGenerator<unknown> {
    try {
      const stream = await this.primary.stream(input, options);
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      if (!isRetryableLlmError(error)) {
        throw error;
      }
      const stream = await this.fallback.stream(input, options);
      for await (const chunk of stream) {
        yield chunk;
      }
    }
  }
}
