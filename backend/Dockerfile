# ============================================
# GymMaster Backend — Dockerfile Multi-Stage
# Context: project root (to reach version.json)
# ============================================

# --- Stage 1: Build ---
FROM node:22-slim AS build

# System dependencies for Prisma (OpenSSL)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm ci

# Copy source code and Prisma schema
COPY backend/ .

# Generate the Prisma Client
RUN npx prisma generate

# --- Stage 2: Production ---
FROM node:22-slim AS produzione

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only what is needed from the build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.js ./

# Copy version.json from the project root for the info-app endpoint
COPY version.json ../version.json

# Make sure the binaries are executable
RUN chmod -R +x node_modules/.bin/

# Non-root user for security
USER node

# Expose the backend port (internal)
EXPOSE 3000

# Start command: migrate the DB, seed it (only fills what is missing), then start the server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/prisma db seed && node src/server.js"]
