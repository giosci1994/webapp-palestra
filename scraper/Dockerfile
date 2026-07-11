FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Copia prisma schema dal backend (path relativo al context root del progetto)
COPY backend/prisma/schema.prisma ./prisma/schema.prisma

# Copia package files scraper
COPY scraper/package.json ./

# Installa dipendenze
RUN npm install

# Genera Prisma client (dummy URL per validazione build-time)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copia script scraper
COPY scraper/*.js ./

# Cron: esegui scraper ogni 30 minuti
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*
RUN echo "*/30 * * * * cd /app && /usr/bin/node scraper-affluenza.js >> /var/log/scraper.log 2>&1" > /etc/cron.d/scraper
RUN chmod 0644 /etc/cron.d/scraper && crontab /etc/cron.d/scraper
RUN touch /var/log/scraper.log

# Variabili env per cron (cron non eredita env)
CMD ["sh", "-c", "env >> /etc/environment && node scraper-affluenza.js && cron && tail -f /var/log/scraper.log"]
