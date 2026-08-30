import { describe, expect, test } from "bun:test";
import {
  createMemoryChatStore,
  createMemoryIngestStore,
  createMemorySkillContentStore,
} from "@aulus/db";
import {
  generateSkillContentResponseSchema,
  jobSchema,
  skillContentArtifactSchema,
} from "@aulus/types";
import { createApp } from "../src/app";
import { createTestProviders } from "./test-providers";

const chunkId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const videoId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";

function createSkillTestApp(options?: { ready?: boolean }) {
  const ready = options?.ready ?? true;
  const ingestStore = createMemoryIngestStore();
  const chatStore = createMemoryChatStore({
    sourceVideos: [{ sourceId, videoId }],
    readyVideoIds: ready ? new Set([videoId]) : new Set(),
    chunks: [
      {
        id: chunkId,
        videoId,
        youtubeVideoId: "abc123",
        chunkIndex: 0,
        content: "Rust ownership transfers at compile time",
        citeStartSec: 12,
        citeEndSec: 48,
        chapterTitle: "Ownership",
      },
    ],
  });
  const skillContentStore = createMemorySkillContentStore();
  const enqueued: Array<{ kind: string; jobId: string }> = [];

  const app = createApp({
    store: ingestStore,
    chatStore,
    skillContentStore,
    providers: createTestProviders({
      generate: `Ownership [[chunk:${chunkId}]]`,
    }),
    enqueueJob: async (kind, jobId) => {
      enqueued.push({ kind, jobId });
    },
  });

  return { app, ingestStore, skillContentStore, enqueued };
}

describe("POST /api/skill-content/generate", () => {
  test("returns 202 and job_id when the Scope has ready Videos", async () => {
    const { app, enqueued } = createSkillTestApp();
    const response = await app.request("/api/skill-content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: { kind: "source", sourceId },
        focus: "ownership",
      }),
    });

    expect(response.status).toBe(202);
    const body = generateSkillContentResponseSchema.parse(await response.json());
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(enqueued).toEqual([
      { kind: "generate_skill_content", jobId: body.jobId },
    ]);
  });

  test("rejects generation when the Scope has zero ready Videos", async () => {
    const { app, enqueued } = createSkillTestApp({ ready: false });
    const response = await app.request("/api/skill-content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: { kind: "source", sourceId },
      }),
    });

    expect(response.status).toBe(400);
    expect(enqueued).toEqual([]);
  });
});

describe("skill-content versions", () => {
  test("lists, previews, and downloads immutable versions for a Scope", async () => {
    const { app, skillContentStore } = createSkillTestApp();
    const first = await skillContentStore.appendArtifact({
      scope: { kind: "source", sourceId },
      markdown: "# v1\n\nbody",
      bestPracticesTemplateVersion: "v0.1",
      modelStamps: { chat: "test" },
    });
    const second = await skillContentStore.appendArtifact({
      scope: { kind: "source", sourceId },
      markdown: "# v2\n\nbody",
      bestPracticesTemplateVersion: "v0.1",
      modelStamps: {},
    });

    const listResponse = await app.request(
      `/api/skill-content?kind=source&sourceId=${sourceId}`,
    );
    expect(listResponse.status).toBe(200);
    const listed = skillContentArtifactSchema
      .array()
      .parse(await listResponse.json());
    expect(listed.map((row) => row.version)).toEqual([2, 1]);
    expect(listed[0]?.id).toBe(second.id);

    const preview = await app.request(`/api/skill-content/${first.id}`);
    expect(preview.status).toBe(200);
    const artifact = skillContentArtifactSchema.parse(await preview.json());
    expect(artifact.markdown).toBe("# v1\n\nbody");
    expect(artifact.version).toBe(1);

    const download = await app.request(
      `/api/skill-content/${second.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("text/markdown");
    expect(await download.text()).toBe("# v2\n\nbody");
  });
});

describe("GET /api/jobs/:id", () => {
  test("returns job progress for a generate_skill_content job", async () => {
    const { app, ingestStore } = createSkillTestApp();
    const created = await app.request("/api/skill-content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: { kind: "source", sourceId },
      }),
    });
    const { jobId } = generateSkillContentResponseSchema.parse(
      await created.json(),
    );

    await ingestStore.updateJob(jobId, {
      status: "running",
      progress: {
        scope: { kind: "source", sourceId },
        focus: "",
        phase: "synthesize",
      },
    });

    const response = await app.request(`/api/jobs/${jobId}`);
    expect(response.status).toBe(200);
    const job = jobSchema.parse(await response.json());
    expect(job.id).toBe(jobId);
    expect(job.kind).toBe("generate_skill_content");
    expect(job.status).toBe("running");
  });
});
