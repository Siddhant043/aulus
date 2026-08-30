import {
  sourceListResponseSchema,
  sourceSchema,
  type Source,
} from "@aulus/types";

/**
 * Thin fetch layer over the same-origin /api. Responses are validated with the
 * shared Zod schemas so the UI and the Hono API can never silently drift.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

export async function listSources(signal?: AbortSignal): Promise<Source[]> {
  const response = await fetch("/api/sources", { signal });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return sourceListResponseSchema.parse(await response.json());
}

export async function createSource(url: string): Promise<Source> {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return sourceSchema.parse(await response.json());
}
