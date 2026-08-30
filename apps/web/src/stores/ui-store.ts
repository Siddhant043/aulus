import { create } from "zustand";

export type Theme = "light" | "dark";

const THEME_KEY = "aulus-theme";

type UiState = {
  theme: Theme;
  /** The Source row currently highlighted in the Library, if any. */
  selectedSourceId: string | null;
  toggleTheme: () => void;
  selectSource: (id: string | null) => void;
};

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Applies the theme to <html data-theme> and persists it. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_KEY, theme);
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  selectedSourceId: null,
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
  },
  selectSource: (id) => set({ selectedSourceId: id }),
}));
