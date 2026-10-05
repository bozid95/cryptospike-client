import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ArrowRight,
  Loader2,
  BotIcon,
  UserPlus,
  CheckCircle2,
  Lock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface LoginViewProps {
  onLoginSuccess: (
    user: { username: string; role: string },
    token: string,
  ) => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Periksa apakah sistem sudah pernah dibuat akun admin pertamanya
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsCheckingStatus(true);
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        setIsInitialized(Boolean(data.initialized));
      } else {
        // Fallback jika offline atau dev mode
        setIsInitialized(true);
      }
    } catch {
      setIsInitialized(true);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password.trim()) {
      setErrorMessage("Username dan password tidak boleh kosong.");
      return;
    }

    if (!isInitialized) {
      // Validasi mode inisialisasi
      if (username.trim().length < 3) {
        setErrorMessage("Username minimal 3 karakter.");
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password minimal 6 karakter.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("Konfirmasi password tidak cocok.");
        return;
      }
    }

    try {
      setIsLoading(true);

      const endpoint = !isInitialized ? "/api/auth/setup" : "/api/auth/login";
      const payload = {
        username: username.trim(),
        password: password.trim(),
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Gagal melakukan autentikasi.");
      }

      onLoginSuccess(
        {
          username: data.user.username,
          role: data.user.role || "Admin",
        },
        data.token || "",
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kesalahan koneksi ke server.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span>Memeriksa status aplikasi...</span>
        </div>
      </div>
    );
  }

  const isSetupMode = isInitialized === false;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm border-border shadow-md bg-card text-card-foreground">
        <CardHeader className="space-y-2 text-center pb-5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-sm mb-1">
            {isSetupMode ? (
              <UserPlus className="size-6 text-primary-foreground" />
            ) : (
              <BotIcon className="size-6 text-primary-foreground" />
            )}
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <CardTitle className="text-xl font-bold tracking-tight">
              CryptoSpike Client
            </CardTitle>
            <Badge
              variant="outline"
              className={`font-mono text-[9px] px-1.5 py-0 h-4 font-semibold ${
                isSetupMode
                  ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                  : "border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
              }`}
            >
              {isSetupMode ? "SETUP PERTAMA" : "CLIENT"}
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            {isSetupMode
              ? "Buat akun Admin utama untuk mengelola bot Anda"
              : "Masuk ke Panel Kontrol Bot Anda"}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-1">
            {isSetupMode && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <span>
                  Sistem baru saja dideploy. Akun ini akan menjadi satu-satunya
                  akun Admin. Registrasi akan ditutup secara permanen setelah
                  ini.
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <ShieldAlert className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-medium">
                Username{" "}
                {isSetupMode && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="username"
                type="text"
                placeholder={isSetupMode ? "admin" : "Masukkan username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="h-9 text-sm"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">
                Password{" "}
                {isSetupMode && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-9 text-sm"
                required
              />
              {isSetupMode && (
                <p className="text-[10px] text-muted-foreground">
                  Minimal 6 karakter.
                </p>
              )}
            </div>

            {isSetupMode && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="confirmPassword"
                  className="text-xs font-medium"
                >
                  Konfirmasi Password{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-9 text-sm"
                  required
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2 flex flex-col gap-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 font-medium cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {isSetupMode ? "Membuat Akun..." : "Memverifikasi..."}
                </>
              ) : isSetupMode ? (
                <>
                  <Lock className="mr-2 size-4" />
                  Buat Akun & Masuk
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
