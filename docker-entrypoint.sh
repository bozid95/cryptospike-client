#!/bin/sh
set -e

echo "=== Starting CryptoSpike Client ==="

# 1. Pastikan folder data untuk database SQLite tersedia
mkdir -p /app/server/data

# 2. Inisialisasi / Sinkronisasi Database SQLite Lokal via Prisma
echo "Syncing SQLite database schema..."
cd /app/server
npx prisma db push || true
cd /app

# 3. Jalankan Express Backend di background
echo "Starting Express Backend on port 3030..."
cd /app/server
npx tsx src/index.ts &
BACKEND_PID=$!

# 4. Jalankan Nginx Reverse Proxy di foreground
echo "Starting Nginx HTTP Proxy on port 80..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Tangani sinyal termination untuk graceful shutdown
trap "kill -TERM $BACKEND_PID $NGINX_PID" SIGINT SIGTERM

wait -n $BACKEND_PID $NGINX_PID

