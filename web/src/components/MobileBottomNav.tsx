import {
  LayoutDashboard,
  Layers,
  Coins,
  UserIcon,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  binancePositionsCount?: number;
  tokocryptoPositionsCount?: number;
}

export function MobileBottomNav({
  activeTab,
  setActiveTab,
  binancePositionsCount = 0,
  tokocryptoPositionsCount = 0,
}: MobileBottomNavProps) {
  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "binance-positions",
      label: "Binance",
      icon: Layers,
      badge: binancePositionsCount > 0 ? binancePositionsCount : undefined,
    },
    {
      id: "tokocrypto-positions",
      label: "Tokocrypto",
      icon: Coins,
      badge:
        tokocryptoPositionsCount > 0 ? tokocryptoPositionsCount : undefined,
    },
    {
      id: "logs",
      label: "Logs",
      icon: Terminal,
    },
    {
      id: "profile",
      label: "Profile",
      icon: UserIcon,
    },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-2 py-1.5 flex items-center justify-around shadow-lg pb-[env(safe-area-inset-bottom,6px)]">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition-colors cursor-pointer select-none ${
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="relative">
              <Icon
                className={`size-5 transition-transform ${isActive ? "scale-110" : ""}`}
              />
              {item.badge !== undefined && (
                <Badge className="absolute -top-1.5 -right-2.5 size-4 p-0 flex items-center justify-center text-[9px] bg-emerald-600 text-white font-bold border-none">
                  {item.badge}
                </Badge>
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight leading-none">
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
