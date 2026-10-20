#!/usr/bin/env bash
# ============================================
# GymMaster — Automatic release
# ============================================
#
# Runs on the server every 2 minutes (crontab, see deploy/README.md): if GitHub
# has a release newer than the installed version, it installs it and reports
# on Telegram. If something goes wrong it goes back to the previous version.
#
#   deploy/rilascio.sh                    checks and, if needed, installs (cron)
#   deploy/rilascio.sh --controlla        only says what it would do
#   deploy/rilascio.sh --installa v1.2.3  installs that release, also to
#                                         retry a failed one
#   deploy/rilascio.sh --prova-telegram   sends a test message
#
# The script's folder (..) is the production one: it has the .env and
# docker compose runs from there. Variables to change the paths (the tests use
# them): RILASCIO_STATO, RILASCIO_BACKUP, RILASCIO_URL, RILASCIO_REPO.

set -uo pipefail

# Everything inside main: bash reads the script while running it, and the
# checkout of a new version can replace it halfway through
main() {
  export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"
  CARTELLA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$CARTELLA" || exit 1
  STATO="${RILASCIO_STATO:-${XDG_STATE_HOME:-$HOME/.local/state}/gymmaster-rilascio}"
  BACKUP="${RILASCIO_BACKUP:-$HOME/backup/gymmaster}"
  URL="${RILASCIO_URL:-http://localhost:6969}"
  REPO="${RILASCIO_REPO:-$(git remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')}"
  LOG="$STATO/rilascio.log"
  mkdir -p "$STATO"

  # One release at a time: if the previous one is still running, exit
  exec 9>"$STATO/blocco"
  if ! flock -n 9; then
    [ -t 1 ] && echo "Un rilascio e' gia' in corso (vedi $LOG)"
    exit 0
  fi

  case "${1:-}" in
    "")               automatico ;;
    --controlla)      controlla ;;
    --installa)       [ -n "${2:-}" ] || { echo "Uso: $0 --installa v1.2.3" >&2; exit 2; }
                      a_video; installa "$2" ;;
    --prova-telegram) telegram "🔧 GymMaster: messaggio di prova dal server dei rilasci" && echo "Inviato (se Telegram e' configurato nel .env)" ;;
    *)                echo "Opzione sconosciuta: $1 (vedi l'inizio di $0)" >&2; exit 2 ;;
  esac
}

# --- What to install ---

automatico() {
  local release attuale
  release="$(ultima_release)" || return 0
  attuale="$(versione_installata)"
  da_installare "$release" "$attuale" || return 0
  # From a terminal everything is shown; from cron it goes to the log
  if [ -t 1 ]; then a_video; else ruota_log; exec >>"$LOG" 2>&1; fi
  installa "$release"
}

controlla() {
  local release attuale
  attuale="$(versione_installata)"
  echo "Cartella: $CARTELLA ($(git describe --tags --always 2>/dev/null))"
  echo "Installata: $attuale"
  if ! release="$(ultima_release)"; then
    echo "Ultima release su GitHub ($REPO): nessuna, o GitHub non risponde"
    return 0
  fi
  echo "Ultima release su GitHub ($REPO): $release"
  if da_installare "$release" "$attuale"; then
    echo "→ La installerei"
  elif [ "$release" = "$(cat "$STATO/fallita" 2>/dev/null)" ]; then
    echo "→ No: e' fallita l'ultima volta. Per riprovare: $0 --installa $release"
  else
    echo "→ Niente da fare"
  fi
}

# The tag of the latest published release (not drafts or pre-releases)
ultima_release() {
  local tag
  tag="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | jq -r '.tag_name // empty' 2>/dev/null)"
  [ -n "$tag" ] && printf '%s\n' "$tag"
}

versione_installata() { jq -r '.versione' version.json; }

# A release is installed only if it is newer than the installed one (never
# go back on our own) and if it has not already failed
da_installare() {
  local versione="${1#v}" attuale="$2"
  [[ "$versione" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [ "$versione" != "$attuale" ] || return 1
  [ "$(printf '%s\n%s\n' "$versione" "$attuale" | sort -V | tail -n 1)" = "$versione" ] || return 1
  [ "$1" != "$(cat "$STATO/fallita" 2>/dev/null)" ]
}

# --- Installation ---

installa() {
  local tag="$1" versione="${1#v}" precedente da inizio cambiati durata
  inizio=$SECONDS
  FASE="preparazione"
  TOCCATO=0
  precedente="$(git rev-parse HEAD)"
  da="$(versione_installata)"
  log "=== Installo $tag (installata: $da, $(git rev-parse --short HEAD))"

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    rifiuta "$tag" "ci sono modifiche non salvate nella cartella di produzione ($CARTELLA)"; return 1
  fi
  # A network problem is not a failed release: retry on the next round
  if ! git fetch --quiet --force --tags origin; then
    log "git fetch non riuscito: riprovo al prossimo giro"; return 1
  fi
  if ! git rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null; then
    rifiuta "$tag" "il tag $tag non esiste"; return 1
  fi
  if ! git merge-base --is-ancestor "$tag" origin/master; then
    rifiuta "$tag" "$tag non e' su master: si installa solo codice gia' unito"; return 1
  fi
  if [ "$(git show "$tag:version.json" | jq -r '.versione')" != "$versione" ]; then
    rifiuta "$tag" "version.json in $tag non dice $versione"; return 1
  fi
  if ! copia_database "$tag"; then
    rifiuta "$tag" "copia del database non riuscita"; return 1
  fi
  if ! git checkout --quiet --detach "$tag"; then
    rifiuta "$tag" "checkout di $tag non riuscito"; return 1
  fi
  cambiati="$(git diff --name-only "$precedente" HEAD)"
  log "File cambiati: $(printf '%s\n' "$cambiati" | grep -c .)"

  if prepara "$cambiati" && passa "$cambiati" && verifica "$versione"; then
    rm -f "$STATO/fallita"
    docker image prune -f --filter label=com.docker.compose.project=web-apppalestra >/dev/null 2>&1
    durata="$(( (SECONDS - inizio) / 60 ))m $(( (SECONDS - inizio) % 60 ))s"
    log "=== $tag installata in $durata"
    if storie; then
      telegram "✅ GymMaster $versione installata ($durata)
$(novita_della_versione)"
    else
      telegram "⚠️ GymMaster $versione installata ($durata), ma le storie delle novità non sono entrate: vedi $LOG sul server"
    fi
    return 0
  fi

  local motivo="$FASE"
  printf '%s\n' "$tag" >"$STATO/fallita"
  if ! git checkout --quiet --detach "$precedente"; then
    log "!!! Fallito: $motivo, e il ritorno al codice di prima non riesce"
    telegram "🚨 GymMaster $versione non installata ($motivo) e non riesco a tornare al codice di prima: serve un intervento. Dettagli: $LOG sul server"
    return 1
  fi
  if [ "$TOCCATO" = 0 ]; then
    # The site was not touched: only the previous images are put back
    log "!!! Fallito: $motivo. Il sito non e' stato toccato: rimetto le immagini della $da"
    prepara "$cambiati" || log "Immagini di prima non ricostruite: le ricostruira' il prossimo rilascio"
    telegram "❌ GymMaster $versione non installata: $motivo. Il sito non è stato toccato, resta la $da. Dettagli: $LOG sul server. Per riprovare: deploy/rilascio.sh --installa $tag"
    return 1
  fi
  log "!!! Fallito: $motivo. Torno alla versione di prima ($da)"
  if prepara "$cambiati" && passa "$cambiati" && verifica "$da"; then
    telegram "❌ GymMaster $versione non installata: $motivo.
È tornata la $da e funziona. Dettagli: $LOG sul server. Per riprovare: deploy/rilascio.sh --installa $tag"
  else
    telegram "🚨 GymMaster $versione non installata ($motivo) e anche il ritorno alla $da non è riuscito ($FASE): serve un intervento. Dettagli: $LOG sul server. Copia del database in $BACKUP"
  fi
  return 1
}

# Changes that touch nginx: its files, or the compose file that mounts them
NGINX='^(nginx/|docker-compose\.yml$)'

# true if one of the changed files matches the expression
# (a here-string, not a pipe: with pipefail, grep -q leaving early could make
# printf fail with SIGPIPE and the whole check answer "not changed")
cambiato() { grep -qE "$2" <<<"$1"; }

# Prepares everything possible without touching the site: images and frontend.
# $1: the files changed from what is running (bot and scraper only if needed)
prepara() {
  local cambiati="$1" servizio
  passo "build del backend" docker compose build backend || return 1
  for servizio in bot scraper; do
    if cambiato "$cambiati" "^$servizio/"; then passo "build di $servizio" docker compose build "$servizio" || return 1; fi
  done
  if [ ! -d frontend/node_modules ] || cambiato "$cambiati" '^frontend/package(-lock)?\.json$'; then
    passo "dipendenze del frontend" npm ci --prefix frontend --no-audit --no-fund || return 1
  fi
  # shellcheck disable=SC2016 # $1 is expanded by the inner bash
  passo "build del frontend" bash -c 'cd frontend && npx vite build --outDir "$1" --emptyOutDir' _ "$STATO/dist" || return 1
  if cambiato "$cambiati" "$NGINX"; then
    # The running nginx still sees the old files: the new configuration is
    # tested in a throwaway container defined by the new compose file, so it
    # gets every file the compose mounts (a new include too)
    passo "controllo della configurazione di nginx" docker compose run --rm --no-deps -T nginx nginx -t || return 1
  fi
}

# The switch: from here on the site changes. The backend applies the migrations at startup
passa() {
  local cambiati="$1" servizio
  TOCCATO=1
  passo "avvio del backend" docker compose up -d --no-deps --force-recreate backend || return 1
  aspetta_sano gymmaster-backend 240 || return 1
  for servizio in bot scraper; do
    if cambiato "$cambiati" "^$servizio/"; then passo "avvio di $servizio" docker compose up -d --no-deps --force-recreate "$servizio" || return 1; fi
  done
  passo "pubblicazione del frontend" rsync -a --delete --checksum "$STATO/dist/" frontend/dist/ || return 1
  if cambiato "$cambiati" "$NGINX"; then
    passo "avvio di nginx" docker compose up -d --no-deps --force-recreate nginx || return 1
    aspetta_sano gymmaster-nginx 120 || return 1
  fi
  # If the compose file changes the rest is aligned: compose recreates only what changed
  if cambiato "$cambiati" '^docker-compose\.yml$'; then
    passo "allineamento dei servizi" docker compose up -d || return 1
  fi
}

# Site and server respond with the expected version
verifica() {
  local attesa="$1" server sito
  FASE="verifica della versione"
  server="$(curl -fsS --max-time 10 "$URL/api/v1/salute" | jq -r '.versione' 2>/dev/null)"
  sito="$(curl -fsS --max-time 10 "$URL/version.json?_=$SECONDS" | jq -r '.versione' 2>/dev/null)"
  log "Versione: server $server, sito $sito (attesa $attesa)"
  [ "$server" = "$attesa" ] && [ "$sito" = "$attesa" ]
}

# The version's stories (prisma/novita.json) enter the "what's new"
storie() {
  passo "storie delle novità" docker compose exec -T backend node src/applica-novita.js
}

copia_database() {
  local file
  mkdir -p "$BACKUP"
  file="$BACKUP/gymmaster-$(date +%Y%m%d-%H%M%S)-prima-di-$1.dump"
  if ! docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file" || [ ! -s "$file" ]; then
    rm -f "$file"
    return 1
  fi
  log "Copia del database: $file ($(du -h "$file" | cut -f1))"
  # Keep the last 10 copies made by releases
  # shellcheck disable=SC2012 # names we create, without spaces
  ls -1t "$BACKUP"/gymmaster-*-prima-di-v*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
}

aspetta_sano() {
  local contenitore="$1" limite="$2" stato="" attesa=0
  FASE="avvio di $contenitore"
  while [ "$attesa" -lt "$limite" ]; do
    stato="$(docker inspect -f '{{.State.Health.Status}}' "$contenitore" 2>/dev/null)"
    [ "$stato" = healthy ] && { log "$contenitore: sano"; return 0; }
    [ "$stato" = unhealthy ] && break
    sleep 3
    attesa=$((attesa + 3))
  done
  log "$contenitore: ${stato:-sconosciuto} dopo ${attesa}s. Ultime righe del log:"
  docker logs --tail 40 "$contenitore" 2>&1
  return 1
}

# --- Utilities ---

# Runs a command logging its output; FASE says where it stopped
passo() {
  FASE="$1"
  shift
  log "--- $FASE"
  "$@" 2>&1
}

rifiuta() {
  log "!!! $1 non installata: $2"
  printf '%s\n' "$1" >"$STATO/fallita"
  telegram "❌ GymMaster ${1#v} non installata: $2. Non è cambiato niente. Per riprovare: deploy/rilascio.sh --installa $1"
}

# The changelog entries for the version in version.json
novita_della_versione() {
  jq -r --arg v "$(versione_installata)" '.changelog[] | select(.versione == $v) | .modifiche[] | "• " + .' version.json 2>/dev/null | head -n 8
}

telegram() {
  local token chat
  token="$(leggi_env TELEGRAM_BOT_TOKEN)"
  chat="$(leggi_env RILASCI_TELEGRAM_CHAT_ID)"
  if [ -z "$token" ] || [ -z "$chat" ]; then
    log "Telegram non configurato (TELEGRAM_BOT_TOKEN e RILASCI_TELEGRAM_CHAT_ID nel .env): nessun messaggio"
    return 0
  fi
  curl -fsS --max-time 20 -o /dev/null "https://api.telegram.org/bot$token/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=$1" 2>/dev/null || log "Messaggio Telegram non inviato"
}

# A value from the .env, without executing it
leggi_env() {
  [ -f .env ] || return 0
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//"
}

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

# With --installa everything is shown and also kept in the log
a_video() { ruota_log; exec > >(tee -a "$LOG") 2>&1; }

ruota_log() {
  if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1048576 ]; then mv -f "$LOG" "$LOG.1"; fi
}

main "$@"
exit $?
