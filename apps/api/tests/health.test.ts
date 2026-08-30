import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";

describe("GET /api/health", () => {
  test("returns 200 with an ok status", async () => {
    const app = createApp();
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
