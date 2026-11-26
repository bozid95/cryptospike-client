import {
  LayoutDashboard,
  LineChart,
  SlidersHorizontal,
  UserIcon,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type MobileExchange = "binance" | "tokocrypto";

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** Bursa terakhir yang dibuka — tab Positions/Settings kembali ke sana. */
  lastExchange: MobileExchange;
  binancePositionsCount?: number;
  tokocryptoPositionsCount?: number;
}

/**
 * Navigasi bawah mobile, dikelompokkan per TUGAS (bukan per bursa):
 * Home · Positions · Settings · Logs · Account.
 * Pilihan bursa (Binance / Tokocrypto) ada di bagian atas halaman Positions & Settings.
 */
export function MobileBottomNav({
  activeTab,
  setActiveTab,
  lastExchange,
  binancePositionsCount = 0,
  tokocryptoPositionsCount = 0,
}: MobileBottomNavProps) {
  const totalPositions = binancePositionsCount + tokocryptoPositionsCount;

  const navItems = [
    {
      id: "dashboard",
      target: "dashboard",
      label: "Home",
      icon: LayoutDashboard,
      isActive: activeTab === "dashboard",
    },
    {
      id: "positions",
      target: `${lastExchange}-positions`,
      label: "Positions",
      icon: LineChart,
      badge: totalPositions > 0 ? totalPositions : undefined,
      isActive: activeTab.endsWith("-positions") || activeTab === "positions",
    },
    {
      id: "settings",
      target: `${lastExchange}-config`,
      label: "Settings",
      icon: SlidersHorizontal,
      isActive: activeTab.endsWith("-config") || activeTab === "config",
    },
    {
      id: "logs",
      target: "logs",
      label: "Logs",
      icon: Terminal,
      isActive: activeTab === "logs",
    },
    {
      id: "profile",
      target: "profile",
      label: "Account",
      icon: UserIcon,
      isActive: activeTab === "profile",
    },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/90 dark:bg-background/85 backdrop-blur-xl border-t border-border/60 px-1 pt-1.5 flex items-stretch justify-around pb-[max(env(safe-area-inset-bottom),0.375rem)]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.isActive;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.target)}
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex flex-col items-center justify-center flex-1 gap-1 py-0.5 transition-colors cursor-pointer select-none [-webkit-tap-highlight-color:transparent] ${
              isActive
                ? "text-primary dark:text-foreground"
                : "text-muted-foreground active:text-foreground"
            }`}
          >
            <div
              className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                isActive ? "bg-primary/10" : ""
              }`}
            >
              <Icon
                className="size-[18px]"
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {item.badge !== undefined && (
                <Badge className="absolute -top-0.5 right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[11px] bg-emerald-500 text-white font-semibold border-2 border-background rounded-full">
                  {item.badge}
                </Badge>
              )}
            </div>
            <span
              className={`text-[11px] tracking-tight leading-none ${isActive ? "font-semibold" : "font-medium"}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
