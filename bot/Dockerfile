# ============================================
# GymMaster Telegram Bot — Dockerfile
# Context: project root (docker-compose)
# ============================================

FROM node:22-slim

WORKDIR /app

# Dependencies: exactly the versions of package-lock.json
COPY bot/package*.json ./
RUN npm ci --omit=dev

# Bot code
COPY bot/ .

# Non-root user for security
USER node

CMD ["node", "bot.js"]
