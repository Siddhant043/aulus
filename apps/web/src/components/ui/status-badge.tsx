import type { Source } from "@aulus/types";
import { sourceStatusLabel, type StatusTone } from "../../lib/status";
import { cn } from "../../lib/cn";

const toneClasses: Record<StatusTone, string> = {
  ready: "bg-tone-ready-bg text-tone-ready",
  ingesting: "bg-tone-ingesting-bg text-tone-ingesting",
  unavailable: "bg-tone-unavailable-bg text-tone-unavailable",
  error: "bg-tone-error-bg text-tone-error",
};

export function StatusBadge({
  source,
}: {
  source: Pick<Source, "status" | "progress">;
}) {
  const { tone, label } = sourceStatusLabel(source);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "font-mono text-xs font-medium tabular-nums",
        toneClasses[tone],
      )}
    >
      {tone === "ingesting" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}
