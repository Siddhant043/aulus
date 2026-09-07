export type SseEvent = { event: string; data: string };

/**
 * Minimal stateful Server-Sent-Events parser for a fetch() body stream. Feed it
 * decoded text chunks; it buffers across boundaries and returns complete events
 * as each blank-line terminator arrives. Only the `event:` and `data:` fields
 * are used — enough for the Chat stream (status/token/citations/done/error).
 */
export function createSseParser() {
  let buffer = "";

  function parseBlock(block: string): SseEvent | null {
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith(":") || line.length === 0) {
        continue;
      }
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") {
        event = value;
      } else if (field === "data") {
        dataLines.push(value);
      }
    }
    if (dataLines.length === 0) {
      return null;
    }
    return { event, data: dataLines.join("\n") };
  }

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const events: SseEvent[] = [];
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const parsed = parseBlock(block);
        if (parsed) {
          events.push(parsed);
        }
        separator = buffer.indexOf("\n\n");
      }
      return events;
    },
  };
}
