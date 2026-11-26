import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  /** Warna aksen saat aktif (kelas Tailwind untuk teks/ikon). */
  activeClassName?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  className?: string;
}

/**
 * Kontrol pilihan bergaya "pill" — ringkas, penuh lebar di mobile,
 * tidak pernah meluber ke samping (label dipotong bila perlu).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "grid w-full gap-1 rounded-xl bg-muted/80 dark:bg-muted/60 p-1 sm:inline-grid sm:w-auto",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer select-none disabled:opacity-60",
              active
                ? cn("bg-card text-primary dark:text-foreground shadow-sm ring-1 ring-border/60 dark:ring-0", opt.activeClassName)
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon && <span className="shrink-0 [&>svg]:size-3.5">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-4",
                  active ? "bg-foreground/10" : "bg-foreground/5",
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
