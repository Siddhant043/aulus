import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "../lib/cn";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  label: string;
  to?: string;
  soon?: boolean;
};

// Library is live now; Chat and skill-content land in T11/T12. Showing them as
// disabled makes the shell's shape visible without pretending they work.
const navItems: NavItem[] = [
  { label: "Library", to: "/" },
  { label: "Chat", soon: true },
  { label: "skill-content", soon: true },
];

function RailLink({ item }: { item: NavItem }) {
  if (item.soon || !item.to) {
    return (
      <span className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted/70">
        {item.label}
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted/60">
          soon
        </span>
      </span>
    );
  }
  return (
    <Link
      to={item.to}
      className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text [&.active]:bg-surface-2 [&.active]:font-medium [&.active]:text-text"
      activeOptions={{ exact: true }}
    >
      {item.label}
    </Link>
  );
}

export function Workbench({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[15rem_1fr]">
      {/* Persistent Sources rail */}
      <aside className="flex flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid size-7 place-items-center rounded-md bg-accent font-mono text-sm font-bold text-accent-fg">
            A
          </span>
          <span className="text-sm font-semibold text-text">Aulus</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {navItems.map((item) => (
            <RailLink key={item.label} item={item} />
          ))}
        </nav>
        <div className="border-t border-border p-2">
          <ThemeToggle />
        </div>
      </aside>

      {/* Working surface */}
      <main className={cn("h-full overflow-y-auto bg-bg")}>{children}</main>
    </div>
  );
}
