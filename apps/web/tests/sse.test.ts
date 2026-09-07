import { describe, expect, test } from "bun:test";
import { createSseParser } from "../src/lib/sse";

describe("createSseParser", () => {
  test("emits a complete event once its blank-line terminator arrives", () => {
    const parser = createSseParser();
    expect(parser.push("event: token\n")).toEqual([]);
    expect(parser.push('data: {"text":"hi"}\n')).toEqual([]);
    // Blank line terminates the event.
    expect(parser.push("\n")).toEqual([
      { event: "token", data: '{"text":"hi"}' },
    ]);
  });

  test("splits multiple events arriving in one chunk", () => {
    const parser = createSseParser();
    const events = parser.push(
      "event: status\ndata: {}\n\nevent: done\ndata: {}\n\n",
    );
    expect(events).toEqual([
      { event: "status", data: "{}" },
      { event: "done", data: "{}" },
    ]);
  });

  test("reassembles an event split across chunk boundaries", () => {
    const parser = createSseParser();
    expect(parser.push("event: to")).toEqual([]);
    expect(parser.push("ken\ndata: {")).toEqual([]);
    const events = parser.push('"text":"x"}\n\n');
    expect(events).toEqual([{ event: "token", data: '{"text":"x"}' }]);
  });

  test("defaults the event name to 'message' when only data is sent", () => {
    const parser = createSseParser();
    expect(parser.push("data: hello\n\n")).toEqual([
      { event: "message", data: "hello" },
    ]);
  });
});
