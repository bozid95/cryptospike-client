import { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

import { LoginView } from "./components/LoginView";
import { AppSidebar } from "./components/AppSidebar";
import { SiteHeader } from "./components/SiteHeader";
import { MobileBottomNav } from "./components/MobileBottomNav";
import ActivePosition from "./components/ActivePosition";
import CredentialConfig from "./components/CredentialConfig";
import { ProfileView } from "./components/ProfileView";
import { AppLogsView } from "./components/AppLogsView";
import { authFetch } from "./lib/api";

const VALID_TABS = ["positions", "logs", "config", "profile"];

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
  return "positions";
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
  const [activePositionsCount, setActivePositionsCount] = useState<number>(0);
  const [status, setStatus] = useState({
    bot_connected: false,
    server_url: "",
  });

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
        setStatus({ bot_connected: false, server_url: "localhost:3030" });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // Polling jumlah posisi aktif Binance secara periodik
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchPositionsCount = async () => {
      try {
        const res = await authFetch("/api/positions");
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.positions)) {
            setActivePositionsCount(data.positions.length);
          }
        }
      } catch {
        // Silent fail
      }
    };

    fetchPositionsCount();
    const interval = setInterval(fetchPositionsCount, 5000);
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
      case "positions":
        return "Active Positions (Binance)";
      case "logs":
        return "Application Activity Logs";
      case "config":
        return "Bot & Credential Config";
      case "profile":
        return "Profile & System Info";
      default:
        return "Dashboard";
    }
  };

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
              activePositionsCount={activePositionsCount}
            />

            {/* Main Content Area */}
            <SidebarInset className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
              <SiteHeader
                botConnected={status.bot_connected}
                serverUrl={status.server_url}
                user={user}
                onLogout={handleLogout}
                activeTabTitle={getTabTitle()}
              />

              <main className="flex-1 p-3 sm:p-4 md:p-6 pb-28 sm:pb-8 w-full max-w-7xl mx-auto space-y-6">
                {activeTab === "positions" && (
                  <ActivePosition
                    onPositionsCountChange={setActivePositionsCount}
                  />
                )}
                {activeTab === "logs" && <AppLogsView />}
                {activeTab === "config" && <CredentialConfig />}
                {activeTab === "profile" && (
                  <ProfileView
                    user={user}
                    botConnected={status.bot_connected}
                    serverUrl={status.server_url}
                    onLogout={handleLogout}
                  />
                )}
              </main>

              {/* Mobile Bottom Navigation */}
              <MobileBottomNav
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                activePositionsCount={activePositionsCount}
              />
            </SidebarInset>
          </div>
        </SidebarProvider>
      )}
      <Toaster position="top-right" />
    </ThemeProvider>
  );
}
