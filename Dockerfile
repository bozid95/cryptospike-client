# ==========================================
# Stage 1: Build Frontend (Vite + React)
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Backend Dependencies
# ==========================================
FROM node:20-slim AS backend-builder
WORKDIR /app/server

COPY server/package*.json ./
COPY server/prisma ./prisma/
COPY server/prisma.config.ts ./
# Menggunakan prebuilt glibc binary tanpa node-gyp compilation
RUN npm install

COPY server/ ./
RUN npx prisma generate

# ==========================================
# Stage 3: Production Runner (All-in-One)
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Install Nginx dan curl di Debian slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Salin backend & dependencies (berisi binary precompiled native linux)
COPY --from=backend-builder /app/server ./server/

# Salin hasil build frontend ke webroot Nginx
COPY --from=frontend-builder /app/web/dist /var/www/html/

# Konfigurasi Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Script entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 80 3030

ENTRYPOINT ["/app/docker-entrypoint.sh"]
