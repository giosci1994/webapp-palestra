# ATTENZIONE: la versione qui sotto e la dipendenza "playwright" in
# scraper/package.json devono restare identiche. L'immagine base contiene i
# binari del browser per quella specifica versione: se npm ne installa una
# diversa, Playwright cerca un eseguibile che non esiste e lo scraper muore
# all'avvio. Per aggiornare, cambiare ENTRAMBI nello stesso commit.
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

# Cron: esegui scraper ogni 30 minuti + trim notturno del log (che altrimenti
# cresce indefinitamente: era arrivato a 4.5 MB). Il trim scrive sullo stesso
# inode cosi' il `tail -f` dell'entrypoint continua a funzionare.
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*
RUN printf '%s\n' \
      '*/30 * * * * cd /app && /usr/bin/node scraper-affluenza.js >> /var/log/scraper.log 2>&1' \
      '17 4 * * * tail -n 2000 /var/log/scraper.log > /tmp/scraper.trim && cat /tmp/scraper.trim > /var/log/scraper.log && rm -f /tmp/scraper.trim' \
      > /etc/cron.d/scraper
RUN chmod 0644 /etc/cron.d/scraper && crontab /etc/cron.d/scraper
RUN touch /var/log/scraper.log

COPY scraper/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Il container e' "sano" solo se cron e' vivo E il log si muove. Il guasto
# precedente (cron mai partito, nessuno scraping per settimane) sarebbe stato
# visibile subito: senza questo controllo il container risultava "Up" e basta.
HEALTHCHECK --interval=5m --timeout=15s --start-period=2m --retries=2 \
  CMD pgrep cron > /dev/null \
      && [ -n "$(find /var/log/scraper.log -mmin -45 2>/dev/null)" ] \
      || exit 1

CMD ["/entrypoint.sh"]
