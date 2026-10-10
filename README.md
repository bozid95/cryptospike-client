# CryptoSpike Client

CryptoSpike Client adalah aplikasi bot otomatis untuk mengeksekusi sinyal trading di Binance Futures (USDT-M). Aplikasi ini terhubung langsung ke server sinyal CryptoSpike menggunakan koneksi WebSocket, sehingga eksekusi order bisa berjalan sangat cepat begitu ada sinyal baru yang masuk.

Semua data penting, seperti API Key dan API Secret Binance Anda, disimpan langsung di komputer atau server Anda sendiri menggunakan database lokal SQLite. Kredensial Anda tidak pernah dikirim ke server pusat atau pihak mana pun, sehingga akun Anda tetap aman di bawah kendali penuh Anda sendiri.

---

## Kemampuan dan Fitur Utama

- **Eksekusi Sinyal Cepat**: Menerima sinyal dari server secara instan dan langsung membuka posisi di Binance Futures tanpa jeda.
- **Data Tersimpan Lokal**: API Key dan Secret Binance Anda tersimpan aman di database lokal Anda sendiri.
- **Take Profit dan Stop Loss Otomatis**:
  - Otomatis memasang target Take Profit bertahap: TP1 (50%), TP2 (30%), dan TP3 (20%).
  - Otomatis memasang Stop Loss di bursa Binance untuk membatasi risiko kerugian.
- **Pengaturan Risiko Sesuai Keinginan**:
  - Bisa mengatur leverage bebas (1x sampai 125x) dan tipe margin (Isolated atau Cross).
  - Bisa menentukan persentase modal yang siap dirisikokan pada setiap transaksi.
  - Membatasi jumlah maksimal posisi yang boleh terbuka secara bersamaan.
  - Menampilkan pratinjau estimasi nominal dolar (USD) yang berisiko sebelum Anda menyimpan setelan.
- **Filter Pilihan Koin**:
  - **All Market**: Mengeksekusi semua koin yang masuk dari sinyal.
  - **Whitelist**: Hanya mengeksekusi koin-koin tertentu yang Anda pilih (misalnya hanya BTC dan ADA).
  - **Blacklist**: Mengeksekusi semua koin kecuali koin-koin yang Anda masukkan ke daftar hitam.
  - **Tombol Pilihan Cepat**: Tersedia tombol instan untuk memilih koin Bluechip, Layer 1, Top 50 CMC, atau Top 100 CMC.
- **Tampilan Web yang Mudah Digunakan**: Dilengkapi dashboard untuk melihat posisi yang sedang berjalan, riwayat trading, dan catatan log aktivitas bot secara langsung.

---

## Kebutuhan Sistem

Sebelum memulai instalasi, pastikan perangkat atau server Anda sudah terpasang:
- **Docker dan Docker Compose** (cara yang paling disarankan dan paling mudah).
- Atau **Node.js** versi 20 ke atas (jika ingin menjalankan manual tanpa Docker).

---

## Cara Instalasi

### Cara 1: Menggunakan Docker Compose (Paling Disarankan)

Cara ini paling praktis jika Anda menggunakan server VPS (seperti Ubuntu atau Debian) maupun panel hosting seperti Dokploy.

1. **Unduh repositori ini:**
   ```bash
   git clone https://github.com/bozid95/cryptospike-client.git
   cd cryptospike-client
   ```

2. **Siapkan file konfigurasi environment:**
   Salin file contoh pengaturan:
   ```bash
   cp .env.example .env
   ```
   Buka file `.env` jika Anda ingin mengubah pengaturan bawaan:
   ```env
   PORT=3080
   SERVER_URL=https://signal.forlearning.my.id
   CLIENT_TOKEN=
   ```

3. **Atur port web (jika tidak menggunakan reverse proxy):**
   Jika Anda menjalankan bot ini langsung di server biasa tanpa Dokploy atau Traefik, buka file `docker-compose.yml` dan pastikan bagian port diarahkan ke port yang Anda inginkan (misalnya port 3080):
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

4. **Jalankan aplikasi:**
   ```bash
   docker compose up --build -d
   ```

5. **Buka di browser:**
   Akses dashboard melalui alamat:
   ```
   http://IP-SERVER-ANDA:3080
   ```
   (Atau gunakan nama domain Anda jika Anda memakai Dokploy).

---

### Cara 2: Menjalankan Manual di Komputer Lokal (Tanpa Docker)

Jika Anda ingin mencoba langsung di komputer Windows atau Mac menggunakan Node.js:

1. **Jalankan bagian server (backend):**
   ```bash
   cd server
   npm install
   npx prisma db push
   npx prisma generate
   npm start
   ```

2. **Jalankan bagian tampilan (frontend):**
   Buka jendela terminal baru:
   ```bash
   cd web
   npm install
   npm run dev
   ```

3. **Buka di browser:**
   Kunjungi alamat `http://localhost:5173`.

---

## Panduan Penggunaan Pertama Kali

Setelah dashboard web terbuka di browser Anda:

1. **Daftarkan Akun Admin**:
   Saat pertama kali dibuka, buat username dan password baru untuk mengunci dashboard bot Anda.
2. **Masukkan Token Lisensi**:
   Buka menu **Bot Config & Credentials**, lalu tempelkan Client Token CryptoSpike yang Anda miliki.
3. **Masukkan Kunci API Binance**:
   - Pilih jaringan: **Testnet** (untuk uji coba dengan saldo virtual) atau **Live** (untuk akun asli).
   - Masukkan Binance API Key dan API Secret Anda. Pastikan pada setelan API Binance Anda, izin **Enable Futures** sudah dicentang.
   - Klik tombol **Test Connection** untuk mengecek apakah kunci API valid dan saldo terbaca.
4. **Atur Risiko dan Pilihan Koin**:
   - Tentukan leverage, tipe margin, dan risiko per trade yang Anda inginkan.
   - Pada bagian **Coin Filter**, pilih apakah Anda ingin mengeksekusi semua koin atau hanya koin tertentu. Anda bisa menekan tombol cepat seperti **Top 50 CMC** atau **Top 100 CMC**.
5. **Nyalakan Auto-Trade dan Simpan**:
   - Nyalakan tombol **Auto-Trade**.
   - Klik **Save Configuration**, periksa ringkasannya di jendela konfirmasi, lalu klik **Confirm & Save**.
   - Bot sekarang sudah berjalan dan akan membuka posisi otomatis saat ada sinyal masuk.

---

## Cara Menjalankan Tes Otomatis (Unit Test)

Jika Anda ingin memastikan logika penyaringan koin berjalan dengan benar di sistem Anda:

```bash
cd server
npm test
```

---

## Cara Memperbarui Bot (Update)

Jika ada pembaruan kode dari repositori ini, Anda cukup menjalankan perintah berikut di folder proyek:

```bash
git pull
docker compose up --build -d
```

Seluruh setelan dan akun Anda tetap aman tersimpan di volume database lokal.

---

## Catatan Risiko

Trading aset kripto di pasar Futures memiliki risiko yang tinggi. Bot ini hanya alat bantu untuk mengeksekusi order secara otomatis. Selalu gunakan dana yang siap Anda tanggung jika terjadi kerugian, uji coba terlebih dahulu menggunakan akun Testnet, dan gunakan manajemen risiko yang bijak. Segala keuntungan dan kerugian trading sepenuhnya merupakan tanggung jawab Anda sendiri.

---

## Lisensi

Proyek ini menggunakan lisensi MIT.
