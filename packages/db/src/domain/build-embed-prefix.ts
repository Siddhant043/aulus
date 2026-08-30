export function buildEmbedPrefix(input: {
  videoTitle: string;
  chapterTitle: string | null;
  body: string;
}): string {
  if (input.chapterTitle) {
    return `${input.videoTitle} · ${input.chapterTitle} · ${input.body}`;
  }
  return `${input.videoTitle} · ${input.body}`;
}
