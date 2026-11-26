import { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

import { LoginView } from "./components/LoginView";
import { AppSidebar } from "./components/AppSidebar";
import { SiteHeader } from "./components/SiteHeader";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { DashboardSummary } from "./components/DashboardSummary";
import ActivePosition from "./components/ActivePosition";
import CredentialConfig from "./components/CredentialConfig";
import { ProfileView } from "./components/ProfileView";
import { AppLogsView } from "./components/AppLogsView";
import { authFetch } from "./lib/api";
import { Segmented } from "@/components/ui/segmented";
import type { MobileExchange } from "./components/MobileBottomNav";

const VALID_TABS = [
  "dashboard",
  "binance-positions",
  "binance-config",
  "tokocrypto-positions",
  "tokocrypto-config",
  "logs",
  "profile",
  "positions",
  "config",
];

const getInitialTab = (): string => {
  if (typeof window !== "undefined") {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
    const savedTab = localStorage.getItem("cryptospike_active_tab");
    if (savedTab && VALID_TABS.includes(savedTab)) {
      return savedTab;
    }
  }
  return "dashboard";
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("cryptospike_auth") === "true";
  });

  const [user, setUser] = useState<{ username: string; role: string }>(() => {
    const savedUser = localStorage.getItem("cryptospike_user");
    return savedUser
      ? JSON.parse(savedUser)
      : { username: "admin", role: "Admin" };
  });

  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const [binancePositionsCount, setBinancePositionsCount] = useState<number>(0);
  const [envCounts, setEnvCounts] = useState({ testnet: 0, live: 0 });
  // Environment Binance yang dipilih lewat pemilih akun mobile
  const [binanceEnv, setBinanceEnv] = useState<"TESTNET" | "LIVE">(() =>
    localStorage.getItem("cryptospike_binance_env") === "LIVE"
      ? "LIVE"
      : "TESTNET",
  );
  const selectBinanceEnv = (env: "TESTNET" | "LIVE") => {
    setBinanceEnv(env);
    localStorage.setItem("cryptospike_binance_env", env);
  };
  const [tokocryptoPositionsCount, setTokocryptoPositionsCount] =
    useState<number>(0);
  const [status, setStatus] = useState({
    bot_connected: false,
    server_url: "",
    version: "1.0.1",
  });

  // Bursa terakhir yang dibuka (dipakai tab Positions/Settings di bottom nav mobile)
  const [lastExchange, setLastExchange] = useState<MobileExchange>(() =>
    localStorage.getItem("cryptospike_last_exchange") === "tokocrypto"
      ? "tokocrypto"
      : "binance",
  );
  useEffect(() => {
    const ex = activeTab.startsWith("tokocrypto-")
      ? "tokocrypto"
      : activeTab.startsWith("binance-")
        ? "binance"
        : null;
    if (ex && ex !== lastExchange) {
      setLastExchange(ex);
      localStorage.setItem("cryptospike_last_exchange", ex);
    }
  }, [activeTab, lastExchange]);

  // Simpan activeTab ke localStorage & sinkronkan ke URL hash
  useEffect(() => {
    localStorage.setItem("cryptospike_active_tab", activeTab);
    if (window.location.hash.replace("#", "") !== activeTab) {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
  }, [activeTab]);

  // Dukung tombol back / forward browser
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (VALID_TABS.includes(hash) && hash !== activeTab) {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [activeTab]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        setStatus({
          bot_connected: false,
          server_url: "localhost:3030",
          version: "1.0.1",
        });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // Polling jumlah posisi aktif per bursa secara periodik untuk badge sidebar
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCounts = async () => {
      try {
        // Binance Testnet & Live counts
        let totalBinance = 0;
        let testnet = 0;
        let live = 0;
        const [btRes, blRes] = await Promise.allSettled([
          authFetch("/api/positions?exchange=BINANCE_TESTNET"),
          authFetch("/api/positions?exchange=BINANCE_LIVE"),
        ]);

        if (btRes.status === "fulfilled" && btRes.value.ok) {
          const btData = await btRes.value.json();
          if (btData.success && Array.isArray(btData.positions)) {
            testnet = btData.positions.length;
            totalBinance += testnet;
          }
        }
        if (blRes.status === "fulfilled" && blRes.value.ok) {
          const blData = await blRes.value.json();
          if (blData.success && Array.isArray(blData.positions)) {
            live = blData.positions.length;
            totalBinance += live;
          }
        }
        setBinancePositionsCount(totalBinance);
        setEnvCounts({ testnet, live });

        // Tokocrypto count
        const tRes = await authFetch("/api/positions?exchange=TOKOCRYPTO");
        if (tRes.ok) {
          const tData = await tRes.json();
          if (tData.success && Array.isArray(tData.positions)) {
            setTokocryptoPositionsCount(tData.positions.length);
          }
        }
      } catch {
        // Silent fail
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLoginSuccess = (
    userData: { username: string; role: string },
    jwtToken: string,
  ) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem("cryptospike_auth", "true");
    localStorage.setItem("cryptospike_jwt", jwtToken);
    localStorage.setItem("cryptospike_user", JSON.stringify(userData));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("cryptospike_auth");
    localStorage.removeItem("cryptospike_jwt");
    localStorage.removeItem("cryptospike_user");
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "dashboard":
        return "Dashboard Summary";
      case "binance-positions":
        return "Binance Futures — Active Positions";
      case "binance-config":
        return "Binance Futures — Configuration";
      case "tokocrypto-positions":
        return "Tokocrypto Spot — Active Holdings";
      case "tokocrypto-config":
        return "Tokocrypto Spot — Configuration";
      case "logs":
        return "Application Activity Logs";
      case "profile":
        return "Profile & System Info";
      case "positions":
        return "Active Positions";
      case "config":
        return "Bot & Credential Config";
      default:
        return "Dashboard";
    }
  };

  const getMobileTitle = () => {
    switch (activeTab) {
      case "dashboard":
        return "Home";
      case "binance-positions":
      case "tokocrypto-positions":
      case "positions":
        return "Positions";
      case "binance-config":
      case "tokocrypto-config":
        return "Settings";
      case "logs":
        return "Activity Logs";
      case "profile":
        return "Account";
      case "config":
        return "Settings";
      default:
        return "CryptoSpike";
    }
  };

  // Mobile: bottom nav per tugas (Positions / Settings); bursa dipilih lewat switch di atas halaman
  const exchangeSection: MobileExchange | null = activeTab.startsWith(
    "binance-",
  )
    ? "binance"
    : activeTab.startsWith("tokocrypto-")
      ? "tokocrypto"
      : null;
  const exchangeView = activeTab.endsWith("-config") ? "config" : "positions";

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {!isAuthenticated ? (
        <LoginView onLoginSuccess={handleLoginSuccess} />
      ) : (
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background text-foreground">
            {/* Desktop & Collapsible Sidebar */}
            <AppSidebar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              user={user}
              onLogout={handleLogout}
              botConnected={status.bot_connected}
              appVersion={status.version || "1.0.0"}
              binancePositionsCount={binancePositionsCount}
              tokocryptoPositionsCount={tokocryptoPositionsCount}
            />

            {/* Main Content Area */}
            <SidebarInset className="flex flex-1 flex-col min-w-0 overflow-x-clip">
              <SiteHeader
                botConnected={status.bot_connected}
                serverUrl={status.server_url}
                user={user}
                onLogout={handleLogout}
                activeTabTitle={getTabTitle()}
                mobileTitle={getMobileTitle()}
              />

              <main className="flex-1 px-3 pt-3 sm:p-4 md:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-8 w-full max-w-7xl mx-auto max-sm:space-y-4">
                {exchangeSection && (
                  <div className="sm:hidden">
                    {/* Satu pemilih akun (tanpa tab bertingkat) */}
                    <Segmented
                      value={
                        exchangeSection === "tokocrypto" ? "TOKO" : binanceEnv
                      }
                      onChange={(v) => {
                        if (v === "TOKO") {
                          setActiveTab(`tokocrypto-${exchangeView}`);
                        } else {
                          selectBinanceEnv(v);
                          setActiveTab(`binance-${exchangeView}`);
                        }
                      }}
                      options={[
                        {
                          value: "TESTNET",
                          label: "Testnet",
                          badge:
                            exchangeView === "positions" && envCounts.testnet > 0
                              ? envCounts.testnet
                              : undefined,
                        },
                        {
                          value: "LIVE",
                          label: "Live",
                          badge:
                            exchangeView === "positions" && envCounts.live > 0
                              ? envCounts.live
                              : undefined,
                        },
                        {
                          value: "TOKO",
                          label: "Tokocrypto",
                          badge:
                            exchangeView === "positions" &&
                            tokocryptoPositionsCount > 0
                              ? tokocryptoPositionsCount
                              : undefined,
                        },
                      ]}
                    />
                  </div>
                )}
                {activeTab === "dashboard" && (
                  <DashboardSummary
                    onNavigate={setActiveTab}
                    botConnected={status.bot_connected}
                    username={user.username}
                  />
                )}
                {activeTab === "binance-positions" && (
                  <ActivePosition
                    forcedExchange="BINANCE"
                    forcedBinanceEnv={binanceEnv}
                    onPositionsCountChange={setBinancePositionsCount}
                  />
                )}
                {activeTab === "binance-config" && (
                  <CredentialConfig
                    forcedExchange="BINANCE"
                    forcedBinanceEnv={binanceEnv}
                  />
                )}
                {activeTab === "tokocrypto-positions" && (
                  <ActivePosition
                    forcedExchange="TOKOCRYPTO"
                    onPositionsCountChange={setTokocryptoPositionsCount}
                  />
                )}
                {activeTab === "tokocrypto-config" && (
                  <CredentialConfig forcedExchange="TOKOCRYPTO" />
                )}
                {activeTab === "logs" && <AppLogsView />}
                {activeTab === "profile" && (
                  <ProfileView
                    user={user}
                    botConnected={status.bot_connected}
                    serverUrl={status.server_url}
                    onLogout={handleLogout}
                    appVersion={status.version || "1.0.1"}
                  />
                )}

                {/* Legacy Hash Fallbacks */}
                {activeTab === "positions" && (
                  <ActivePosition
                    onPositionsCountChange={setBinancePositionsCount}
                  />
                )}
                {activeTab === "config" && <CredentialConfig />}
              </main>

              {/* Mobile Bottom Navigation */}
              <MobileBottomNav
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                lastExchange={lastExchange}
                binancePositionsCount={binancePositionsCount}
                tokocryptoPositionsCount={tokocryptoPositionsCount}
              />
            </SidebarInset>
          </div>
        </SidebarProvider>
      )}
      <Toaster position="top-right" />
    </ThemeProvider>
  );
}
