import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={`size-8 sm:size-9 rounded-lg border border-slate-300 dark:border-zinc-700 ${className || ""}`}
        disabled
      >
        <span className="size-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`size-8 sm:size-9 rounded-lg border border-slate-300 dark:border-zinc-700 hover:border-emerald-500/40 hover:bg-emerald-500/5 cursor-pointer transition-all ${className || ""}`}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle Theme Mode"
    >
      {isDark ? (
        <SunIcon className="size-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <MoonIcon className="size-4 text-slate-700 transition-transform duration-200 hover:-rotate-12" />
      )}
    </Button>
  );
}

