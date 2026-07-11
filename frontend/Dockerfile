# ============================================
# GymMaster Frontend — Dockerfile
# Build React + serve con Nginx
# ============================================

# Stage 1: Build
FROM node:22-slim AS build
WORKDIR /app

# Copia package files e installa dipendenze
COPY package*.json ./
RUN npm ci

# Copia codice sorgente e builda
COPY . .
RUN npm run build

# Stage 2: Serve con Nginx
FROM nginx:stable-alpine AS produzione

# Copia build output
COPY --from=build /app/dist /usr/share/nginx/html

# Copia config nginx per SPA (fallback su index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
