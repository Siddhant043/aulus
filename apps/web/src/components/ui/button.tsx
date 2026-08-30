import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "ghost" | "outline";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:pointer-events-none disabled:opacity-50 h-9 px-3.5";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  outline:
    "border border-border-strong bg-surface text-text hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], className)} {...props} />
  );
}
