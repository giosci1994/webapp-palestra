#!/bin/sh
# ============================================
# GymMaster — Avvio container scraper
# ============================================
# L'ordine qui sotto e' deliberato. In precedenza il CMD era una catena
#   node scraper-affluenza.js && cron && tail -f ...
# e bastava che il primo run si bloccasse perche' `cron` non partisse mai:
# il container restava "Up" ma non scrapava piu' nulla, in silenzio.
# Ora cron parte per primo e non dipende dall'esito del primo run.
set -u

LOG=/var/log/scraper.log
touch "$LOG"

# cron non eredita l'ambiente del container: glielo passiamo via /etc/environment.
# Le variabili di servizio della shell vanno escluse, altrimenti sporcano l'env dei job.
env | grep -vE '^(HOME|PWD|SHLVL|OLDPWD|_)=' > /etc/environment

# 1. Schedulazione attiva da subito, qualunque cosa succeda dopo.
cron
echo "[entrypoint] cron avviato ($(date '+%Y-%m-%d %H:%M:%S'))" >> "$LOG"

# 2. Primo run in background: non deve poter bloccare l'avvio del container.
#    Lo script ha un watchdog interno (TIMEOUT_GLOBALE) che ne garantisce l'uscita.
(
  cd /app || exit 1
  node scraper-affluenza.js >> "$LOG" 2>&1
  echo "[entrypoint] primo run terminato (codice $?)" >> "$LOG"
) &

# 3. PID 1 resta il tail: il container vive finche' vive questo processo,
#    quindi non muore piu' per colpa di un run fallito.
exec tail -f "$LOG"
