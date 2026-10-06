import React from "react";
import {
  BotIcon,
  BriefcaseIcon,
  SlidersIcon,
  UserIcon,
  LogOutIcon,
  Terminal,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarRail,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: { username: string; role: string };
  onLogout: () => void;
  botConnected: boolean;
  activePositionsCount?: number;
}

export function AppSidebar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  botConnected,
  activePositionsCount = 0,
  ...props
}: AppSidebarProps) {
  const menuItems = [
    {
      id: "positions",
      title: "Active Positions",
      icon: BriefcaseIcon,
      badge:
        activePositionsCount > 0 ? `${activePositionsCount} Open` : undefined,
    },
    {
      id: "config",
      title: "Bot & API Config",
      icon: SlidersIcon,
    },
    {
      id: "profile",
      title: "Profile & Account",
      icon: UserIcon,
    },
    {
      id: "logs",
      title: "Application Logs",
      icon: Terminal,
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent cursor-pointer"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
                <BotIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold flex items-center gap-1.5">
                  CryptoSpike
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 h-4 border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                  >
                    CLIENT
                  </Badge>
                </span>
                <span className="truncate text-xs text-muted-foreground flex items-center gap-1">
                  <span
                    className={`inline-block size-1.5 rounded-full ${botConnected ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                  {botConnected ? "Online" : "Offline"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setActiveTab(item.id)}
                      tooltip={item.title}
                      className="cursor-pointer"
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 font-semibold"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/40">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs uppercase">
                  {user.username.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-xs leading-tight">
                <span className="truncate font-semibold">{user.username}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {user.role}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
              >
                <LogOutIcon className="size-4" />
              </button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
