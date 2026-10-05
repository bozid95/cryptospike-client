import { LogOutIcon, ServerIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";

interface SiteHeaderProps {
  botConnected: boolean;
  serverUrl: string;
  user: { username: string; role: string };
  onLogout: () => void;
  activeTabTitle: string;
}

export function SiteHeader({
  botConnected,
  serverUrl,
  user,
  onLogout,
  activeTabTitle,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-4 transition-all">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm hidden sm:inline-block">
            {activeTabTitle}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Status Indikator Bot */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full border border-border text-xs bg-muted/40">
          <ServerIcon className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground truncate max-w-[150px]">
            {serverUrl || "localhost:3030"}
          </span>
          <span
            className={`inline-block size-2 rounded-full ${
              botConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span
            className={
              botConnected
                ? "text-emerald-500 font-medium"
                : "text-red-500 font-medium"
            }
          >
            {botConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Theme Toggle Mode */}
        <ThemeToggle />

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative size-8 rounded-full p-0"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold uppercase">
                  {user.username.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user.username}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.role}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground">
              <ShieldCheckIcon className="mr-2 size-4 text-emerald-500" />
              <span>Security Active</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive cursor-pointer"
            >
              <LogOutIcon className="mr-2 size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
