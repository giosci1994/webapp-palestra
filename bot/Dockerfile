# ============================================
# GymMaster Bot Telegram — Dockerfile
# Context: root del progetto (docker-compose)
# ============================================

FROM node:22-slim

WORKDIR /app

# Dipendenze
COPY bot/package*.json ./
RUN npm install --omit=dev

# Codice del bot
COPY bot/ .

# Utente non-root per sicurezza
USER node

CMD ["node", "bot.js"]
