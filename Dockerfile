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

# Install compiler tools untuk kompilasi native C++ addon better-sqlite3 via node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
COPY server/prisma ./prisma/
COPY server/prisma.config.ts ./
RUN npm install

COPY server/ ./
RUN npx prisma generate

# ==========================================
# Stage 3: Production Runner (All-in-One)
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Install Nginx, curl, dan openssl di Debian slim (Prisma runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    openssl \
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
