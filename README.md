# ⚡ CryptoSpike Client

**CryptoSpike Client** adalah aplikasi bot eksekusi perdagangan otomatis (*autonomous execution client*) berkecepatan tinggi (*zero-delay*) untuk **Binance USDT-M Futures**. Aplikasi ini terhubung langsung ke jaringan sinyal **CryptoSpike Gateway** melalui koneksi WebSocket *real-time*.

Dirancang dengan prinsip **100% Client-Side Privacy**, seluruh kredensial API Key Binance dan preferensi manajemen risiko Anda disimpan dan dienkripsi secara lokal di mesin Anda sendiri menggunakan SQLite, tanpa pernah dikirim ke server pihak ketiga.

---

## 🚀 Fitur Utama

- **⚡ Zero-Delay Signal Execution**: Menerima broadcast sinyal dan menembakkan order Market Entry ke Binance Futures dalam hitungan milidetik melalui WebSocket berkecepatan tinggi.
- **🔒 100% Private & Aman**: Kredensial API Key dan Secret Binance Anda tersimpan secara lokal di mesin/server Anda sendiri.
- **🎯 Multi-Target TP & SL Otomatis**:
  - Penempatan otomatis **TP1 (50%)**, **TP2 (30%)**, dan **TP3 (20%)** Limit Order.
  - Penempatan otomatis **Stop Loss (Conditional Algo Order)** langsung di bursa Binance untuk melindungi modal Anda.
- **🛡️ Manajemen Risiko Dinamis**:
  - Pengaturan Leverage fleksibel (1x - 125x) dan mode Margin (ISOLATED / CROSS).
  - Pembatasan risiko per trade (`Risk Per Trade %`).
  - Pembatasan jumlah posisi terbuka simultan (`Max Open Positions`).
  - Preview estimasi nominal risiko riil (USD) dan skenario terburuk (*Worst-Case Scenario*) sebelum menyimpan.
- **🪙 Coin Filter (Trading Scope)**:
  - **All Market**: Menerima dan mengeksekusi semua koin yang dipindai oleh CryptoSpike.
  - **Whitelist Only**: Hanya mengeksekusi sinyal koin yang Anda izinkan (misal: hanya BTCUSDT dan ADAUSDT).
  - **Blacklist**: Mengecualikan koin-koin tertentu yang ingin Anda hindari.
  - **Preset Instan**: Tombol cepat **Bluechips**, **Top L1**, **Top 50 CMC**, dan **Top 100 CMC**.
- **📊 Web Dashboard Modern**: Dilengkapi monitoring posisi aktif langsung dari Binance, riwayat order, dan stream log aktivitas *real-time*.

---

## 📋 Prasyarat Sistem

Sebelum menginstal, pastikan server atau mesin Anda telah terpasang:
- **Docker** dan **Docker Compose** *(Sangat Direkomendasikan)*
- ATAU **Node.js** v20.x atau lebih baru dan **npm** v10+ (jika menjalankan tanpa Docker)

---

## 🛠️ Panduan Instalasi

### Metode 1: Menggunakan Docker Compose (Direkomendasikan)

Metode ini adalah cara termudah dan paling stabil untuk deploy di VPS (Ubuntu/Debian) atau platform seperti Dokploy, Coolify, dan Portainer.

#### 1. Clone Repositori
```bash
git clone https://github.com/bozid95/cryptospike-client.git
cd cryptospike-client
```

#### 2. Siapkan File Konfigurasi Environment
Salin template konfigurasi `.env.example`:
```bash
cp .env.example .env
```
Isi konfigurasi pada file `.env` jika diperlukan:
```env
PORT=3080
SERVER_URL=https://signal.forlearning.my.id
CLIENT_TOKEN=
```

#### 3. Konfigurasi Port Host (Jika Diperlukan)
Jika Anda **tidak** menggunakan Reverse Proxy seperti Dokploy/Traefik dan ingin mengakses web langsung melalui port tertentu (misal port 3080), buka `docker-compose.yml` dan aktifkan binding port:
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

#### 4. Build dan Jalankan Container
```bash
docker compose up --build -d
```

Periksa status container:
```bash
docker compose ps
docker compose logs -f
```

Buka browser Anda dan akses:
```
http://IP_SERVER_ANDA:3080
# atau domain yang Anda hubungkan (jika menggunakan Dokploy/Reverse Proxy)
```

---

### Metode 2: Instalasi Manual (Development / Local Node.js)

Jika Anda ingin menjalankan atau mengembangkan aplikasi di komputer lokal tanpa Docker:

#### 1. Setup Backend Server
```bash
cd server
npm install

# Inisialisasi Database SQLite Lokal
npx prisma db push
npx prisma generate

# Jalankan Backend Server (Port 3030)
npm start
```

#### 2. Setup Frontend Web
Buka terminal baru:
```bash
cd web
npm install

# Jalankan Frontend Development Server (Port 5173)
npm run dev
```

Buka browser di `http://localhost:5173`.

---

## 🚦 Panduan Konfigurasi Awal (Quick Start)

Setelah web dashboard berhasil dibuka:

1. **Buat Akun Admin**:
   - Pada kunjungan pertama, buat username dan password untuk akun Admin lokal Anda.
2. **Pasang Lisensi (Client Token)**:
   - Masuk ke tab **Bot Config & Credentials**.
   - Masukkan **Client Token** CryptoSpike yang Anda miliki.
3. **Konfigurasi Kredensial Binance**:
   - Pilih environment: **Testnet** (untuk simulasi) atau **Live** (untuk akun riil).
   - Masukkan **Binance API Key** dan **API Secret**. Pastikan API Key di akun Binance Anda memiliki izin **Enable Futures**.
   - Klik tombol **Test Connection** untuk memverifikasi koneksi dan saldo dompet Anda.
4. **Atur Manajemen Risiko & Coin Filter**:
   - Tentukan Leverage (misal `10x`), Margin Type (`ISOLATED`), dan `Risk Per Trade %` (misal `2%`).
   - Pada kartu **Coin Filter**, pilih mode filter:
     - Gunakan preset **Top 50 CMC** atau **Top 100 CMC** jika Anda hanya ingin trading pada koin-koin berkapitalisasi besar.
     - Atau ketik simbol koin khusus (contoh: `BTCUSDT, ADAUSDT`).
5. **Aktifkan Auto-Trade & Simpan**:
   - Aktifkan toggle **Auto-Trade**.
   - Klik **Save Configuration**, periksa rincian pada popup konfirmasi, dan klik **Confirm & Save**.
   - Bot sekarang aktif dan siap mengeksekusi sinyal secara otomatis!

---

## 🧪 Menjalankan Unit Test

Untuk menguji integritas logika Coin Filter dan validitas preset Top 50 & Top 100 CMC:

```bash
cd server
npm test
```

Hasil pengujian otomatis akan menampilkan laporan:
```
# tests 17 | pass 17 | fail 0
```

---

## 🔄 Pembaruan / Update Bot

Jika ada update terbaru dari repositori, jalankan:

```bash
cd cryptospike-client
git pull
docker compose up --build -d
```

Database dan pengaturan Anda tetap aman karena tersimpan di persistent volume `cryptospike_data`.

---

## ⚠️ Disclaimer

Aplikasi ini adalah perangkat lunak otomasi trading independen. Perdagangan aset kripto dan instrumen derivatif (Futures) mengandung tingkat risiko yang tinggi dan dapat mengakibatkan kerugian modal. Pastikan Anda selalu menggunakan dana dingin (*risk capital*), menguji coba strategi di mode **Testnet** terlebih dahulu, dan menerapkan manajemen risiko yang bijak. Pengembang tidak bertanggung jawab atas kerugian finansial yang timbul dari keputusan perdagangan Anda.

---

## 📄 Lisensi

Didistribusikan di bawah lisensi **MIT License**. Lihat file [LICENSE](file:///c:/My%20Project/CryptoSpike-Client/LICENSE) untuk informasi lebih lanjut.
