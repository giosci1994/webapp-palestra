# ============================================
# GymMaster Backend — Dockerfile Multi-Stage
# Context: root del progetto (per accesso a version.json)
# ============================================

# --- Stage 1: Build ---
FROM node:22-slim AS build

# Dipendenze di sistema per Prisma (OpenSSL)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia package files e installa dipendenze
COPY backend/package*.json ./
RUN npm ci

# Copia codice sorgente e schema Prisma
COPY backend/ .

# Genera il Prisma Client
RUN npx prisma generate

# --- Stage 2: Produzione ---
FROM node:22-slim AS produzione

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia solo il necessario dal build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

# Copia version.json dalla root del progetto per l'endpoint info-app
COPY version.json ../version.json

# Assicura permessi di esecuzione sui binari
RUN chmod -R +x node_modules/.bin/

# Utente non-root per sicurezza
USER node

# Esponi la porta del backend (interna)
EXPOSE 3000

# Comando di avvio: migra DB e poi avvia il server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/prisma db seed && node src/server.js"]
