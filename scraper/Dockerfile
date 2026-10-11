# WARNING: the version below and the "playwright" dependency in
# scraper/package.json must stay identical. The base image contains the
# browser binaries for that specific version: if npm installs a different
# one, Playwright looks for an executable that does not exist and the scraper
# dies at startup. To upgrade, change BOTH in the same commit.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Copy the prisma schema from the backend (path relative to the project root context)
COPY backend/prisma/schema.prisma ./prisma/schema.prisma

# Copy the scraper package files (lockfile included: without it, npm would
# resolve the versions from scratch at every build, and that is exactly how
# Playwright had ended up at 1.62 on a 1.60 base image)
COPY scraper/package.json scraper/package-lock.json ./

# Install dependencies exactly as in the lockfile
RUN npm ci

# Generate the Prisma client (dummy URL for build-time validation)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copy the scraper scripts
COPY scraper/*.js ./

# Cron: run the scraper every 30 minutes + nightly trim of the log (which
# otherwise grows forever: it had reached 4.5 MB). The trim writes to the same
# inode so the entrypoint's `tail -f` keeps working.
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*
RUN printf '%s\n' \
      '*/30 * * * * cd /app && /usr/bin/node scraper-affluenza.js >> /var/log/scraper.log 2>&1' \
      '17 4 * * * tail -n 2000 /var/log/scraper.log > /tmp/scraper.trim && cat /tmp/scraper.trim > /var/log/scraper.log && rm -f /tmp/scraper.trim' \
      > /etc/cron.d/scraper
RUN chmod 0644 /etc/cron.d/scraper && crontab /etc/cron.d/scraper
RUN touch /var/log/scraper.log

COPY scraper/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# The container is "healthy" only if cron is alive AND the log is moving. The
# earlier failure (cron never started, no scraping for weeks) would have been
# visible right away: without this check the container just showed "Up".
HEALTHCHECK --interval=5m --timeout=15s --start-period=2m --retries=2 \
  CMD pgrep cron > /dev/null \
      && [ -n "$(find /var/log/scraper.log -mmin -45 2>/dev/null)" ] \
      || exit 1

CMD ["/entrypoint.sh"]
