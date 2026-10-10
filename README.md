# CryptoSpike Client

**CryptoSpike Client** adalah aplikasi bot trading otomatis mutakhir untuk mengeksekusi sinyal trading secara instan ke bursa **Binance Futures (USDT-M)** dan **Tokocrypto Spot Market**.

Aplikasi ini terhubung langsung ke Server Sinyal CryptoSpike melalui koneksi WebSocket _real-time_ berlatensi rendah (_ultra-low latency_), sehingga setiap sinyal yang terbit dapat langsung diproses dan dieksekusi tanpa jeda.

Semua data sensitif—termasuk API Key dan API Secret bursa Anda—disimpan secara lokal di perangkat/server Anda sendiri menggunakan basis data SQLite lokal. Kredensial Anda **tidak pernah dikirimkan** ke server sinyal atau pihak ketiga mana pun, memberikan keamanan maksimal di bawah kendali penuh Anda.

---

## 🚀 Fitur Unggulan & Arsitektur Utama

### 1. Multi-Exchange Architecture (Dual-Bursa Simultan)

Pilih bursa target eksekusi sesuai preferensi dan profil risiko Anda:

- **Binance Futures (USDT-M)**:
  - Mendukung posisi **LONG & SHORT** dengan leverage bebas ($1\times$ hingga $125\times$).
  - Pilihan tipe margin: **Isolated** atau **Cross Margin**.
  - **Smart Multi-Take Profit**: Otomatis memasang TP bertahap di bursa: TP1 (50%), TP2 (30%), dan TP3 (20%).
  - **Stop Loss Otomatis**: Memasang proteksi Stop Loss di Binance untuk membatasi risiko likuidasi.
- **Tokocrypto Spot Market (OpenAPI v1)**:
  - Pasar Spot 1x Cash-Only: Khusus posisi **BUY / LONG** tanpa risiko margin liquidation.
  - Mendukung pilihan **Quote Asset**: **USDT** (misal: BTC_USDT, ETH_USDT) dan **BIDR** (Rupiah, misal: BTC_BIDR).
  - **Fixed Cash Allocation**: Alokasi pembelian spot berbasis nominal kas tetap ($ / Rp) per transaksi yang disesuaikan secara presisi terhadap aturan `stepSize` dan `minNotional` bursa.
  - **Background Spot Monitor**: Pemantauan harga otomatis setiap 4 detik untuk mengeksekusi Take Profit atau Stop Loss posisi spot.
  - **Manual Sell Now & Close All**: Kemudahan menutup sebagian atau seluruh posisi spot aktif secara manual kapan saja dari dashboard.
- **Mode BOTH (Dual Execution)**: Mengeksekusi order ke Binance Futures dan Tokocrypto Spot secara bersamaan dari satu sinyal yang sama.

---

### 2. 🛡️ Fee Shield Protection (Anti-Rugi Biaya Bursa)

Transaksi spot pada bursa teregulasi seperti Tokocrypto dikenakan biaya transaksi dan pajak (Taker 0.15%, PPh Final 0.21%, ICEx 0.0444% per sisi, total _round-trip_ $\approx 0.8088\%$).

Fitur **Fee Shield** otomatis mengevaluasi target Take Profit:

- Jika TP1 sinyal dinilai terlalu tipis ($<+2.5\%$), sistem otomatis mengalihkan target ke TP2 atau menaikkannya ke batas aman minimal $+3.0\%$.
- Menjamin margin keuntungan bersih (_net profit_) tetap positif dan tebal di atas biaya komisi dan pajak bursa.

---

### 3. 🧪 Mode Dry-Run (Simulasi Tanpa Modal Riil)

- Uji coba strategi dan alur eksekusi sinyal Tokocrypto Spot tanpa perlu menyetor dana atau menggunakan saldo asli.
- Order simulasi dicatat dan dipantau di dashboard dengan kalkulasi PnL riil berdasarkan harga pasar terkini.

---

### 4. 🎯 Universal Coin Filter (Trading Scope)

Batasi dan sesuaikan pasangan koin yang ingin Anda perdagangkan secara independen untuk Binance dan Tokocrypto:

- **ALL**: Mengeksekusi seluruh sinyal koin yang terbit.
- **WHITELIST**: Hanya mengeksekusi koin-koin pilihan yang ada di daftar putih Anda (misal: BTC, ETH, SOL).
- **BLACKLIST**: Mengeksekusi semua koin _kecuali_ koin-koin yang masuk dalam daftar hitam.
- **Quick Preset Buttons**: Tombol instan untuk memilih koin **Bluechip**, **Layer 1**, **Top 50 CoinMarketCap**, atau **Top 100 CoinMarketCap**.
- **Smart Symbol Dual-Match**: Otomatis mendeteksi variasi format simbol, seperti `BTCUSDT`, `BTC_USDT`, `BTC/USDT`, hingga multiplier memecoin (`1000PEPE` vs `PEPE`).

---

### 5. 📊 Interactive Risk & Allocation Calculator

- **Live Balance Auto-Fetch**: Saldo dompet Futures dan Kas Spot dimuat otomatis dari bursa.
- **Transparansi Risiko**:
  - Pratinjau alokasi margin per trade, perkiraan contract size dengan leverage, dan batas risiko terburuk (_worst-case margin risk_).
  - Pratinjau modal kas spot, total modal yang dibutuhkan untuk seluruh posisi terbuka, dan sisa cadangan kas (_Cash Reserve_).
  - Indikator peringatan cerdas apabila alokasi modal melebihi saldo kas (_over-budget_) atau alokasi margin melebihi $100\%$ saldo dompet.

---

### 6. 💻 Dashboard Web Modern & Terstandarisasi

- Antarmuka web responsif dengan navigasi bersih berbasis Tailwind CSS dan Lucide Icons.
- Standardisasi bahasa Inggris yang konsisten dan profesional pada seluruh status, log eksekusi, dan notifikasi.
- **Side-by-Side Dual-Exchange Snapshot**: Menampilkan metrik akun Binance dan Tokocrypto secara berdampingan.
- **Live Mark Price Stream**: Pembaruan harga berjalan melalui WebSocket Binance Futures dan ticker Tokocrypto.

---

## 🛠️ Kebutuhan Sistem

Sebelum memulai instalasi, pastikan sistem Anda telah terpasang salah satu dari opsi berikut:

- **Docker & Docker Compose** (_Sangat disarankan untuk kemudahan deployment VPS / Server / Dokploy_).
- Atau **Node.js versi 20 ke atas** bersama npm (jika ingin menjalankan manual tanpa Docker).

---

## 📥 Panduan Instalasi

### Cara 1: Menggunakan Docker Compose (Rekomendasi Utama)

Metode terbaik untuk server VPS (Ubuntu, Debian, CentOS) maupun panel hosting Dokploy/Coolify:

1. **Clone repositori:**

   ```bash
   git clone https://github.com/bozid95/cryptospike-client.git
   cd cryptospike-client
   ```

2. **Siapkan environment file:**

   ```bash
   cp .env.example .env
   ```

   Sesuaikan isi `.env` jika diperlukan:

   ```env
   PORT=3080
   SERVER_URL=https://signal.forlearning.my.id
   CLIENT_TOKEN=
   ```

3. **Verifikasi port di `docker-compose.yml`:**
   Pastikan port web telah diarahkan sesuai kebutuhan (contoh: port 3080):

   ```yaml
   services:
     client:
       build: .
       container_name: cryptospike-client
       restart: unless-stopped
       ports:
         - "3080:80"
       volumes:
         - cryptospike_data:/app/server/data
   ```

4. **Jalankan container:**

   ```bash
   docker compose up --build -d
   ```

5. **Akses Dashboard:**
   Buka browser dan akses alamat:
   ```
   http://IP-SERVER-ANDA:3080
   ```

---

### Cara 2: Menjalankan Manual di Komputer Lokal (Node.js)

1. **Jalankan Backend Server:**

   ```bash
   cd server
   npm install
   npx prisma generate
   npm start
   ```

2. **Jalankan Frontend Web:**
   Buka jendela terminal baru:

   ```bash
   cd web
   npm install
   npm run dev
   ```

3. **Akses Dashboard:**
   Buka browser di `http://localhost:5173`.

---

## 📖 Panduan Konfigurasi Pertama Kali

1. **Daftarkan Akun Admin**:
   Pada kunjungan pertama, buat username dan password untuk mengamankan akses ke dashboard bot Anda.
2. **Masukkan License Token (Client Token)**:
   Buka menu **Bot Settings & Credentials**, lalu masukkan Client Token lisensi CryptoSpike Anda.
3. **Pilih Target Exchange**:
   - Pilih bursa trading yang ingin dioperasikan: **Binance Futures**, **Tokocrypto Spot**, atau **BOTH (Dual Execution)**.
4. **Konfigurasi Kredensial Bursa**:
   - **Binance Futures**: Masukkan API Key & Secret (pilih _Testnet_ atau _Live_). Pastikan opsi _Enable Futures_ aktif pada manajemen API Binance Anda.
   - **Tokocrypto Spot**: Masukkan API Key & Secret OpenAPI Tokocrypto serta pilih Quote Asset trading Anda (**USDT** atau **BIDR**).
   - Klik tombol **Test Connection** untuk memverifikasi keabsahan API dan memuat saldo kas/wallet.
5. **Atur Parameter Risiko & Alokasi**:
   - Untuk **Binance**: Tentukan leverage ($1\times - 125\times$), margin type (Isolated/Cross), persentase risiko per trade (% Wallet), dan batas maksimal posisi terbuka.
   - Untuk **Tokocrypto**: Tentukan alokasi nominal kas per order ($ USDT atau Rp BIDR) serta batas maksimal koin yang boleh dibeli bersamaan. Anda juga dapat mengaktifkan **Dry-Run (Simulasi)** untuk uji coba.
6. **Setel Filter Koin (Trading Scope)**:
   - Pilih mode `ALL`, `WHITELIST`, atau `BLACKLIST` dan manfaatkan tombol preset cepat (_Top 50 CMC_, _Top 100 CMC_, dll.).
7. **Aktifkan Auto-Trade & Simpan**:
   - Nyalakan sakelar **Auto-Trade**, klik **Save Configuration**, periksa pratinjau kalkulasi pada modal konfirmasi, lalu klik **Confirm & Save**.
   - Bot sekarang aktif di latar belakang dan siap mengeksekusi setiap sinyal yang masuk secara otomatis!

---

## 🧪 Menjalankan Pengujian Otomatis (Unit Testing)

Untuk memverifikasi keakuratan logika filter koin dan perhitungan alokasi lot:

```bash
cd server
npm test
```

---

## 🔄 Cara Memperbarui Bot (Update)

Jika terdapat pembaruan kode pada repositori GitHub:

```bash
git pull
docker compose up --build -d
```

_Seluruh konfigurasi, kredensial, dan data transaksi Anda tetap aman tersimpan di volume database lokal._

---

## ⚠️ Disclaimer & Manajemen Risiko

Trading aset kripto—khususnya pada pasar derivatif Futures maupun pasar Spot—memiliki tingkat volatilitas dan risiko kerugian modal yang nyata.

Aplikasi **CryptoSpike Client** berfungsi sebagai perangkat lunak otomatisasi eksekusi sinyal dan tidak menjamin keuntungan finansial tertentu. Selalu gunakan manajemen modal yang bijak, lakukan uji coba menggunakan akun Testnet atau mode Dry-Run sebelum menggunakan dana riil, dan jangan pernah merisikokan dana yang Anda tidak siap untuk kehilangan. Segala keputusan trading dan hasil finansial sepenuhnya merupakan tanggung jawab Anda sendiri.

---

## 📄 Lisensi

Didistribusikan di bawah lisensi resmi **MIT License**.
