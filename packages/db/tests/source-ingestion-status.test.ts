import { describe, expect, test } from "bun:test";
import { sourceIngestionStatus } from "../src/domain/source-ingestion-status";

describe("sourceIngestionStatus", () => {
  test("is ingesting while any video is still pending", () => {
    expect(
      sourceIngestionStatus(["pending_transcript", "ready"]),
    ).toEqual({
      status: "ingesting",
      progress: { discovered: 1, ready: 1, unavailable: 0, error: 0 },
    });
  });

  test("is ready when every video is ready", () => {
    expect(sourceIngestionStatus(["ready"])).toEqual({
      status: "ready",
      progress: { discovered: 0, ready: 1, unavailable: 0, error: 0 },
    });
  });

  test("is unavailable when the only video has no captions", () => {
    expect(sourceIngestionStatus(["unavailable"])).toEqual({
      status: "unavailable",
      progress: { discovered: 0, ready: 0, unavailable: 1, error: 0 },
    });
  });
});
