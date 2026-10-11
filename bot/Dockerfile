# ============================================
# GymMaster Telegram Bot — Dockerfile
# Context: project root (docker-compose)
# ============================================

FROM node:22-slim

WORKDIR /app

# Dependencies
COPY bot/package*.json ./
RUN npm install --omit=dev

# Bot code
COPY bot/ .

# Non-root user for security
USER node

CMD ["node", "bot.js"]
