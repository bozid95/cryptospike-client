# Changelog

Semua perubahan penting pada proyek **CryptoSpike Client** akan didokumentasikan dalam berkas ini.

Format berkas ini mengacu pada [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan mematuhi kaidah [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-10-14

### 🚀 Fitur Baru (Added)

- **Trade Direction Filter (Binance Futures)**:
  - Penambahan pengaturan arah posisi yang diizinkan: `BOTH SIDES` (default), `LONG ONLY`, atau `SHORT ONLY`.
  - Kontrol antarmuka (UI Dropdown & status badge) pada dashboard CryptoSpike Client.
  - Persistensi konfigurasi ke database SQLite lokal via Prisma (`tradeDirection` pada model `BinanceConfig`).
  - Filtrasi ketat di socket runner: secara otomatis mengabaikan sinyal yang berlawanan arah dengan konfigurasi pengguna serta mencatat log audit.
- **Native Binance Trailing Stop Market (Hybrid Runner)**:
  - Implementasi order tipe `TRAILING_STOP_MARKET` melalui endpoint Binance Algo Order (`/fapi/v1/algoOrder`).
  - Alokasi pembagian posisi TP bertahap: TP1 (50% Limit), TP2 (30% Limit), dan TP3 Runner (20% Trailing Stop dinamis).
  - Pilihan aktivasi trailing stop saat harga menyentuh target TP1 atau TP2.
- **Auto Break-Even Point (Auto-BEP)**:
  - Pemindahan Stop Loss otomatis ke harga Entry (+ buffer biaya bursa 0.2% untuk Long, -0.2% untuk Short) begitu order TP1 terisi (_filled_).
- **Background Futures Monitor**:
  - Pemantau latar belakang berkala untuk mendeteksi keterisian TP1 dan memicu pergeseran Stop Loss ke BEP.
  - Deteksi penutupan posisi (_position closed_) untuk pembersihan otomatis sisa order terbuka (_open orders cleanup_).
- **Interactive Release Notes Modal**:
  - Modal dialog interaktif pada Web Dashboard yang dapat dibuka dengan mengklik lencana versi di sidebar untuk melihat riwayat patch dan catatan pembaruan.

### 🛡️ Peningkatan & Patch (Changed & Improved)

- **Database Migration Resmi**:
  - Penambahan berkas migrasi resmi `20261014162000_add_trade_direction_to_binance_config` sehingga pipeline deployment VPS/Docker via `npx prisma migrate deploy` dapat menerapkan penambahan kolom `tradeDirection` secara otomatis.
- **Smart-Merge MinNotional Protection**:
  - Penggabungan otomatis kuantitas TP3 (20%) ke TP2 (Limit Order) jika nilai nominal kuantitas runner berada di bawah batas minimum Binance Futures ($5 USDT), mencegah penolakan order dari bursa.
- **Boundary Clamping Nilai Callback Rate**:
  - Pembatasan nilai persentase callback rate secara otomatis ke rentang aman bursa Binance Futures (0.1% s/d 5.0%), mencegah error penolakan parameter.
- **Sinyal Payload Sanitization & Normalisasi**:
  - Normalisasi otomatis sinyal berlabel `BUY`/`SELL` menjadi `LONG`/`SHORT`.
  - Pencegahan crash/unhandled exception jika payload sinyal cacat (`side: null`, `undefined`, atau teks acak).
- **Sub-lot Size Guard**:
  - Validasi kuantitas pasca pembulatan `stepSize`. Eksekusi dihentikan lebih awal jika kuantitas bernilai `0` untuk mencegah error bursa.

### 🐛 Perbaikan Bug (Fixed)

- **Dual Order Mass Cancellation**:
  - Pembersihan order terbuka kini membatalkan _regular orders_ (`/fapi/v1/allOpenOrders`) dan _algo conditional orders_ (`/fapi/v1/allOpenOrders` algo) secara serentak sehingga tidak ada sisa order Trailing Stop yang tertinggal saat posisi sudah ditutup.
- **Anti-Spam / Idempotency pada Auto-BEP**:
  - Memastikan perintah pergeseran Stop Loss ke BEP hanya dieksekusi tepat 1 kali untuk setiap siklus posisi aktif, mencegah redundansi request ke bursa.

---

## [1.0.0] - 2026-10-13

### 🚀 Fitur Awal (Initial Release)

- **Multi-Exchange Trading Execution**:
  - Eksekusi otomatis sinyal trading ke bursa **Binance Futures** (USDT-M) dan **Tokocrypto Spot** (BIDR & USDT).
  - Mode eksekusi simultan (`BOTH`) untuk mengeksekusi kedua bursa sekaligus dari satu sinyal.
- **Tokocrypto Spot Guard & Net Accounting**:
  - Akuntansi kuantitas bersih pasca potongan komisi bursa.
  - Fitur _Fee Shield_ untuk memastikan target Take Profit menutup komisi bursa dan pajak.
  - _Dynamic Auto-Merge_ untuk sisa kuantitas di bawah ambang minimum bursa ($5).
  - Pemantau latar belakang (_Background Spot Monitor_) dan fitur _Hold Mode_.
- **Kalkulator Risiko & Manajemen Posisi**:
  - Konfigurasi Leverage (1x - 125x) dan tipe margin (Cross/Isolated).
  - Pembagian Take Profit bertahap (TP1 50%, TP2 30%, TP3 20%) dan Stop Loss otomatis.
  - Filter koin Whitelist, Blacklist, dan All Market.
- **Dashboard Web**:
  - Antarmuka berbasis React, Tailwind CSS, dan Lucide icons dengan dark/light theme.
  - Pemantau status bot real-time, live mark price, dan log transaksi.
- **Penyimpanan Lokal Aman**:
  - Seluruh kredensial API Key & Secret tersimpan di database lokal SQLite terenkripsi di sisi klien.
