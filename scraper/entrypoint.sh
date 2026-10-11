#!/bin/sh
# ============================================
# GymMaster — Scraper container startup
# ============================================
# The order below is deliberate. Previously the CMD was a chain
#   node scraper-affluenza.js && cron && tail -f ...
# and it was enough for the first run to hang for `cron` to never start:
# the container stayed "Up" but silently stopped scraping anything.
# Now cron starts first and does not depend on the outcome of the first run.
set -u

LOG=/var/log/scraper.log
touch "$LOG"

# cron does not inherit the container's environment: we pass it via /etc/environment.
# The shell's own service variables must be excluded, or they pollute the jobs' env.
env | grep -vE '^(HOME|PWD|SHLVL|OLDPWD|_)=' > /etc/environment

# 1. Scheduling active right away, whatever happens next.
cron
echo "[entrypoint] cron avviato ($(date '+%Y-%m-%d %H:%M:%S'))" >> "$LOG"

# 2. First run in the background: it must not be able to block the container start.
#    The script has an internal watchdog (TIMEOUT_GLOBALE) that guarantees it exits.
(
  cd /app || exit 1
  node scraper-affluenza.js >> "$LOG" 2>&1
  echo "[entrypoint] primo run terminato (codice $?)" >> "$LOG"
) &

# 3. PID 1 stays the tail: the container lives as long as this process lives,
#    so it no longer dies because of a failed run.
exec tail -f "$LOG"
