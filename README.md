# CryptoSpike Client

CryptoSpike Client adalah bot trading otomatis untuk mengeksekusi sinyal trading ke **Binance Futures** dan **Tokocrypto Spot**. Bot ini terhubung langsung ke server sinyal CryptoSpike via WebSocket, jadi setiap ada sinyal baru langsung dieksekusi secara instan.

Semua data sensitif seperti API Key dan Secret tersimpan aman di database lokal SQLite Anda sendiri dan tidak pernah dikirim ke pihak luar.

---

## Fitur Utama

- **Mendukung Dua Bursa (Multi-Exchange)**:
  - **Binance Futures (USDT-M)**: Posisi Long & Short, leverage 1x - 125x, margin Isolated/Cross, serta Take Profit bertahap (TP1 50%, TP2 30%, TP3 20%) dan Stop Loss otomatis.
  - **Tokocrypto Spot**: Pasar Spot 1x (khusus Buy/Long) tanpa risiko likuidasi margin, mendukung pair USDT dan BIDR (Rupiah). Dilengkapi perhitungan kuantitas bersih koin (_Net Quantity Accounting_) pasca komisi bursa, Take Profit bertahap dinamis (TP1 50%, TP2 30%, TP3 20%) dengan **Smart Merge & Dynamic Auto-Merge** (mencegah sisa koin tanggung di bawah $5 bursa), serta Stop Loss otomatis.
  - **Mode BOTH**: Eksekusi sinyal ke Binance dan Tokocrypto secara bersamaan dari satu sinyal.
- **Fee Shield (Tokocrypto)**: Proteksi otomatis yang menyesuaikan target Take Profit jika margin profit terlalu tipis, memastikan hasil trading tetap surplus di atas biaya bursa dan pajak.
- **Background Spot Monitor & Hold Mode**: Pemantau posisi spot aktif di latar belakang (tiap 4 detik) untuk eksekusi TP bertahap dan SL otomatis secara real-time. Jika toggle **Auto-Trade** dimatikan, pemantau otomatis dijeda (**Hold Mode**) sehingga aset koin tetap aman di-hold tanpa auto-sell. Tersedia juga deteksi auto-sync posisi kosong serta tombol manual _Sell Now_ dan _Close All_.
- **Mode Dry-Run (Simulasi)**: Uji coba sinyal di Tokocrypto tanpa menggunakan saldo riil.
- **Filter Koin**: Pilihan mode _All Market_, _Whitelist_, atau _Blacklist_, lengkap dengan tombol cepat (Top 50 CMC, Top 100 CMC, Bluechip, Layer 1).
- **Kalkulator Risiko**: Estimasi nominal risiko per trade, contract size, cadangan kas, serta peringatan otomatis jika alokasi melebihi saldo.
- **Dashboard Web**: Tampilan modern untuk memantau posisi aktif, riwayat transaksi, live mark price, dan log eksekusi.

---

## Instalasi

### 1. Menggunakan Docker Compose (Direkomendasikan)

Cocok untuk VPS (Ubuntu/Debian) atau panel seperti Dokploy:

```bash
git clone https://github.com/bozid95/cryptospike-client.git
cd cryptospike-client

cp .env.example .env
# Edit file .env jika ingin mengganti SERVER_URL atau PORT

docker compose up --build -d
```

Buka dashboard di browser melalui `http://IP-SERVER-ANDA:3080`.

### 2. Menjalankan Manual (Node.js v20+)

**Backend:**

```bash
cd server
npm install
npx prisma generate
npm start
```

**Frontend:**

```bash
cd web
npm install
npm run dev
```

Buka di browser melalui `http://localhost:5173`.

---

## Panduan Penggunaan Singkat

1. **Buat Akun Admin**: Saat pertama kali membuka web, buat username dan password untuk mengunci dashboard.
2. **Masukkan License Token**: Masukkan Client Token CryptoSpike di menu **Bot Settings**.
3. **Pilih Exchange & Isi Kredensial**:
   - Pilih target exchange: Binance, Tokocrypto, atau BOTH.
   - Masukkan API Key dan Secret, lalu klik **Test Connection** untuk mengecek koneksi dan saldo.
4. **Atur Risiko & Filter Koin**:
   - Tentukan leverage, persentase risiko (Binance), atau alokasi nominal kas (Tokocrypto).
   - Tentukan filter koin jika hanya ingin trading koin tertentu.
5. **Aktifkan Auto-Trade**: Nyalakan toggle Auto-Trade, lalu klik **Save Configuration**. Bot sudah siap berjalan otomatis. (Khusus Tokocrypto: matikan toggle Auto-Trade jika ingin mengaktifkan **Hold Mode** agar koin yang sudah dibeli tidak dijual otomatis oleh pemantau TP/SL).

---

## Update Bot

Untuk memperbarui bot ke versi terbaru dari Git:

```bash
git pull
docker compose up --build -d
```

Data konfigurasi dan riwayat trading tetap aman di volume database lokal.

---

## Disclaimer

Trading kripto memiliki risiko kerugian modal. Aplikasi ini adalah alat bantu eksekusi otomatis dan tidak menjamin profit. Gunakan manajemen risiko yang bijak dan uji coba dengan Testnet atau mode Dry-Run terlebih dahulu. Segala risiko trading merupakan tanggung jawab pengguna.

---

## Lisensi

Proyek ini menggunakan lisensi MIT.
