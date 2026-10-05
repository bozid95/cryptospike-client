import { useState } from "react";
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  ServerIcon,
  DatabaseIcon,
  KeyIcon,
  LogOutIcon,
  SaveIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ProfileViewProps {
  user: { username: string; role: string };
  botConnected: boolean;
  serverUrl: string;
  onLogout: () => void;
}

export function ProfileView({
  user,
  botConnected,
  serverUrl,
  onLogout,
}: ProfileViewProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setErrorMessage("Harap masukkan password saat ini dan password baru.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password baru minimal 6 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi password baru tidak cocok.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Gagal mengubah kata sandi.");
      }

      setSuccessMessage(data.message);
      toast.success("Password Berhasil Diperbarui!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setErrorMessage(
        err.message || "Terjadi kesalahan saat menghubungi server.",
      );
      toast.error("Gagal Memperbarui Password", {
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Profil & Informasi Sistem
        </h2>
        <p className="text-sm text-muted-foreground">
          Kelola sesi login operator lokal dan pantau status koneksi Client App
          Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolom Kiri: Profil Singkat */}
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader className="text-center pb-4">
            <Avatar className="size-20 mx-auto mb-2 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold uppercase">
                {user.username.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="text-lg">{user.username}</CardTitle>
            <CardDescription>{user.role}</CardDescription>
            <div className="pt-2 flex justify-center">
              <Badge
                variant="outline"
                className={`text-xs px-2 py-0.5 ${
                  botConnected
                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/5"
                    : "border-red-500/40 text-red-600 bg-red-500/5"
                }`}
              >
                {botConnected ? "Connected" : "Standalone"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-2 text-xs border-t">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Tipe Lisensi:</span>
              <span className="font-semibold text-emerald-600">
                Self-Hosted Client
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Penyimpanan:</span>
              <span className="font-semibold">SQLite Lokal</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Enkripsi API:</span>
              <span className="font-semibold text-emerald-600">
                AES-256 Enabled
              </span>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button
              variant="destructive"
              className="w-full gap-2 text-xs cursor-pointer"
              onClick={onLogout}
            >
              <LogOutIcon className="size-4" />
              Keluar dari Sesi
            </Button>
          </CardFooter>
        </Card>

        {/* Kolom Kanan: Pengaturan Akun & Status */}
        <div className="md:col-span-2 space-y-6">
          {/* Status Server & Database */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ServerIcon className="size-4 text-primary" />
                Informasi Runtime Bot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Database SQLite</span>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  ./data/cryptospike_local.db
                </Badge>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <ServerIcon className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    Host Sinyal Terhubung
                  </span>
                </div>
                <span className="text-xs font-mono font-medium">
                  {serverUrl || "localhost:3030"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Form Ganti Password Operator */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyIcon className="size-4 text-primary" />
                Ubah Password Akses Dashboard
              </CardTitle>
              <CardDescription className="text-xs">
                Perbarui kata sandi untuk melindungi dashboard web Anda dari
                akses pihak ketiga.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdatePassword}>
              <CardContent className="space-y-4 pt-1">
                {errorMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <ShieldAlertIcon className="size-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-600">
                    <ShieldCheckIcon className="size-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="curr-pass" className="text-xs font-medium">
                    Password Saat Ini{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="curr-pass"
                    type="password"
                    placeholder="••••••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pass" className="text-xs font-medium">
                    Password Baru <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-pass"
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pass" className="text-xs font-medium">
                    Konfirmasi Password Baru{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-9 text-xs"
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isLoading}
                  className="gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <SaveIcon className="size-3.5" />
                      Perbarui Password
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
