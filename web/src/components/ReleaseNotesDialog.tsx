import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Wrench,
  Calendar,
  History,
  TrendingUp,
} from "lucide-react";

export interface ReleaseNote {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  sections: {
    title: string;
    type: "feature" | "improvement" | "fix";
    items: {
      headline: string;
      desc: string;
    }[];
  }[];
}

export const RELEASE_NOTES_DATA: ReleaseNote[] = [
  {
    version: "1.0.1",
    date: "14 Oktober 2026",
    isLatest: true,
    summary:
      "Pembaruan fungsionalitas Binance Futures: Filter Arah Sinyal (Long / Short / Both), Trailing Stop Native dengan Algo Order, Auto-BEP dengan fee buffer, dan mitigasi menyeluruh untuk kasus ekstrem.",
    sections: [
      {
        title: "Fitur Baru (New Features)",
        type: "feature",
        items: [
          {
            headline: "Allowed Position Side (Trade Direction Filter)",
            desc: "Pilihan eksekusi posisi 'BOTH SIDES', 'LONG ONLY', atau 'SHORT ONLY' pada akun Binance Futures. Tersedia langsung di UI Dashboard dan tersimpan di database lokal.",
          },
          {
            headline: "Native Binance Trailing Stop Market (Hybrid Runner)",
            desc: "Order Take Profit 3 (20%) dieksekusi menggunakan order native TRAILING_STOP_MARKET melalui endpoint Binance Algo Order dengan callback rate dinamis.",
          },
          {
            headline: "Auto Break-Even Point (Auto-BEP)",
            desc: "Stop Loss otomatis digeser ke titik Entry (+0.2% fee buffer untuk Long, -0.2% untuk Short) seketika setelah target TP1 tercapai.",
          },
          {
            headline: "Background Futures Monitor Service",
            desc: "Layanan latar belakang cerdas yang secara realtime memantau keterisian TP1 untuk pergeseran BEP dan membersihkan order terbuka saat posisi ditutup.",
          },
        ],
      },
      {
        title: "Peningkatan & Ketahanan Sistem (Improvements)",
        type: "improvement",
        items: [
          {
            headline: "Smart-Merge MinNotional Guard",
            desc: "Jika alokasi kuantitas TP3 Runner berada di bawah batas minimum Binance ($5), kuantitas TP3 otomatis dilebur ke TP2 (Limit Order) agar tidak di-reject bursa.",
          },
          {
            headline: "Boundary Clamping Callback Rate (0.1% - 5.0%)",
            desc: "Secara otomatis membatasi input callback rate ke rentang toleransi resmi Binance Futures untuk menjamin penerimaan order.",
          },
          {
            headline: "Normalisasi Sinyal & Sanitasi Payload",
            desc: "Menerima sinyal berlabel BUY/SELL dengan normalisasi ke LONG/SHORT, serta perlindungan terhadap payload sinyal cacat tanpa crash.",
          },
        ],
      },
      {
        title: "Perbaikan & Mitigasi (Fixes & Patches)",
        type: "fix",
        items: [
          {
            headline: "Dual Order Mass Cancellation",
            desc: "Pembersihan order terbuka kini membatalkan order reguler dan order kondisional algo sekaligus, mencegah order Trailing Stop menggantung.",
          },
          {
            headline: "Anti-Spam Idempotency Auto-BEP",
            desc: "Memastikan pemindahan Stop Loss ke BEP hanya dilakukan tepat satu kali per siklus trade.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "13 Oktober 2026",
    summary:
      "Rilis resmi perdana CryptoSpike Client dengan arsitektur multi-exchange trading otomatis ke Binance Futures dan Tokocrypto Spot.",
    sections: [
      {
        title: "Fitur Perdana (Initial Release)",
        type: "feature",
        items: [
          {
            headline: "Multi-Exchange Auto Execution",
            desc: "Mengeksekusi sinyal trading real-time via WebSocket ke Binance Futures dan Tokocrypto Spot.",
          },
          {
            headline: "Tokocrypto Spot Guard & Fee Shield",
            desc: "Manajemen spot murni dengan komisi bersih, penyesuaian target profit terhadap fee/pajak, dan pencegahan sisa koin tanggung.",
          },
          {
            headline: "Kalkulator Risiko & Alokasi Modal",
            desc: "Kalkulasi margin, leverage dinamis, pembagian TP bertahap (50/30/20), serta filter koin (Whitelist/Blacklist).",
          },
        ],
      },
    ],
  },
];

interface ReleaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAppVersion?: string;
}

export function ReleaseNotesDialog({
  open,
  onOpenChange,
  currentAppVersion = "1.0.1",
}: ReleaseNotesDialogProps) {
  const [selectedVersion, setSelectedVersion] = useState<string>(
    RELEASE_NOTES_DATA[0]?.version || "1.0.1",
  );

  const activeRelease =
    RELEASE_NOTES_DATA.find((r) => r.version === selectedVersion) ||
    RELEASE_NOTES_DATA[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden sm:rounded-xl">
        {/* Header */}
        <div className="p-6 pb-4 border-b bg-muted/30">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    Release Notes & Updates
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Catatan pembaruan, fitur baru, dan patch perbaikan sistem
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Version Selector Tabs */}
            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-border/50 overflow-x-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                <History className="size-3.5" />
                <span>Versi:</span>
              </div>
              {RELEASE_NOTES_DATA.map((rel) => {
                const isActive = rel.version === selectedVersion;
                const isCurrent = rel.version === currentAppVersion;
                return (
                  <button
                    key={rel.version}
                    onClick={() => setSelectedVersion(rel.version)}
                    className={`px-3 py-1 text-xs rounded-full font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>v{rel.version}</span>
                    {rel.isLatest && (
                      <span className="text-[9px] px-1 py-0 rounded bg-emerald-500 text-white font-sans font-bold uppercase">
                        Latest
                      </span>
                    )}
                    {isCurrent && !rel.isLatest && (
                      <span className="text-[9px] px-1 py-0 rounded bg-blue-500 text-white font-sans font-medium">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </DialogHeader>
        </div>

        {/* Content Body */}
        {activeRelease && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
            {/* Version Meta */}
            <div className="p-3.5 rounded-lg border bg-card/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-mono">
                    v{activeRelease.version}
                  </span>
                  {activeRelease.isLatest && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">
                      Versi Terkini
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  <span>{activeRelease.date}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {activeRelease.summary}
              </p>
            </div>

            {/* Sections */}
            <div className="space-y-5">
              {activeRelease.sections.map((sec, secIdx) => {
                let badgeClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
                let Icon = Sparkles;

                if (sec.type === "improvement") {
                  badgeClass = "bg-blue-500/10 text-blue-600 border-blue-500/30";
                  Icon = TrendingUp;
                } else if (sec.type === "fix") {
                  badgeClass = "bg-amber-500/10 text-amber-600 border-amber-500/30";
                  Icon = Wrench;
                }

                return (
                  <div key={secIdx} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold px-2 py-0.5 border flex items-center gap-1.5 ${badgeClass}`}
                      >
                        <Icon className="size-3" />
                        <span>{sec.title}</span>
                      </Badge>
                    </div>

                    <div className="space-y-2.5 pl-2">
                      {sec.items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="flex items-start gap-2.5 text-xs leading-relaxed"
                        >
                          <div className="mt-1 size-1.5 rounded-full bg-primary/70 shrink-0" />
                          <div className="space-y-0.5">
                            <span className="font-semibold text-foreground">
                              {item.headline}:{" "}
                            </span>
                            <span className="text-muted-foreground">
                              {item.desc}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>CryptoSpike Client &bull; SQLite Local Storage</span>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
