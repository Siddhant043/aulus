import { useUiStore } from "../stores/ui-store";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="w-full justify-start"
    >
      <span aria-hidden>{theme === "dark" ? "☾" : "☀"}</span>
      <span className="text-sm">{theme === "dark" ? "Dark" : "Light"}</span>
    </Button>
  );
}
