import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJson3Events, fetchTranscriptWithYtdlp } from "../src/ingest/ytdlp-fetcher";

describe("parseJson3Events", () => {
  test("maps json3 events to timestamped Transcript segments", () => {
    expect(
      parseJson3Events({
        events: [
          { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
          { tStartMs: 50, segs: [{ utf8: "\n" }] },
          { tStartMs: 1200, dDurationMs: 800, segs: [{ utf8: "Again." }] },
        ],
      }),
    ).toEqual([
      { text: "Hello world", startMs: 0, durationMs: 1200 },
      { text: "Again.", startMs: 1200, durationMs: 800 },
    ]);
  });
});

describe("fetchTranscriptWithYtdlp", () => {
  test("asks yt-dlp to write json3 subs, not only simulate a dump", async () => {
    let argv: string[] = [];
    const result = await fetchTranscriptWithYtdlp(
      "dQw4w9WgXcQ",
      async (command, cwd) => {
        argv = command;
        await writeFile(
          join(cwd, "dQw4w9WgXcQ.en.json3"),
          JSON.stringify({
            events: [
              { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hi" }] },
            ],
          }),
        );
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            title: "Never Gonna Give You Up",
            chapters: [{ start_time: 0, title: "Intro" }],
          }),
          stderr: "",
        };
      },
    );

    expect(argv).toContain("--write-subs");
    expect(argv).toContain("--write-auto-subs");
    expect(argv).toContain("--no-simulate");
    expect(argv).toContain("-J");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.chapters).toEqual([
        { startSec: 0, title: "Intro" },
      ]);
    }
  });
});

