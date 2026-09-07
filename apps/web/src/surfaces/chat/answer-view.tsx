import type { CitationRef } from "@aulus/types";
import {
  citationHref,
  formatTimestamp,
  parseAnswerSegments,
  parseMarkdownLinks,
} from "../../lib/answer";

function chipClasses(): string {
  return (
    "mx-0.5 inline-flex items-center gap-1 rounded-full border border-border-strong " +
    "bg-surface-2 px-1.5 align-baseline text-[11px] font-medium text-muted " +
    "transition-colors hover:border-accent hover:text-text"
  );
}

function CitationChip({
  citation,
  label,
}: {
  citation: CitationRef;
  label: string;
}) {
  return (
    <a
      href={citationHref(citation)}
      target="_blank"
      rel="noreferrer noopener"
      className={chipClasses()}
      title={`Watch from ${formatTimestamp(citation.citeStartSec)}`}
    >
      {label}
    </a>
  );
}

/** Streaming answer: raw tokens + resolved citations → inline numbered chips. */
function DraftBody({
  text,
  citations,
}: {
  text: string;
  citations: CitationRef[];
}) {
  const segments = parseAnswerSegments(text, citations);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <CitationChip
            key={i}
            citation={segment.citation}
            label={String(segment.index)}
          />
        ),
      )}
    </p>
  );
}

/** Persisted answer: display markdown with inline `[label](url)` deep-links. */
function PersistedBody({ content }: { content: string }) {
  const segments = parseMarkdownLinks(content);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noreferrer noopener"
            className={chipClasses()}
          >
            {segment.label}
          </a>
        ),
      )}
    </p>
  );
}

/** On-demand detail for the resolved Citations — no permanent inspector panel. */
function SourcesDetail({ citations }: { citations: CitationRef[] }) {
  if (citations.length === 0) {
    return null;
  }
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-text">
        {citations.length} source{citations.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {citations.map((citation, i) => (
          <li key={citation.chunkId ?? i}>
            <a
              href={citationHref(citation)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 hover:text-text"
            >
              <span className="font-mono tabular-nums text-muted">
                [{i + 1}]
              </span>
              <span className="font-mono">
                {formatTimestamp(citation.citeStartSec)}–
                {formatTimestamp(citation.citeEndSec)}
              </span>
              <span className="truncate text-accent">
                youtu.be/{citation.youtubeVideoId}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function DraftAnswer({
  text,
  citations,
}: {
  text: string;
  citations: CitationRef[];
}) {
  return (
    <div>
      <DraftBody text={text} citations={citations} />
      <SourcesDetail citations={citations} />
    </div>
  );
}

export function PersistedAnswer({
  content,
  citations,
}: {
  content: string;
  citations: CitationRef[];
}) {
  return (
    <div>
      <PersistedBody content={content} />
      <SourcesDetail citations={citations} />
    </div>
  );
}
