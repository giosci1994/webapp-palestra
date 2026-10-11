#!/usr/bin/env bash
# ============================================
# GymMaster — Prove dello script di rilascio
# ============================================
#
#   bash deploy/test/rilascio.test.sh
#
# Non tocca niente di vero: un repository git di prova (con un "origin" locale)
# fa da cartella di produzione, e docker, curl, npm e npx sono finti: scrivono
# cosa gli si chiede in $FINTI/chiamate e i messaggi Telegram in
# $FINTI/telegram. Servono bash, git, jq, rsync e flock.

# shellcheck disable=SC2016 # le prove sono stringhe che eval valuta dopo
set -uo pipefail
QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export FINTI="$TMP/finti" GIT_AUTHOR_NAME=Prova GIT_AUTHOR_EMAIL=prova@esempio.it GIT_COMMITTER_NAME=Prova GIT_COMMITTER_EMAIL=prova@esempio.it
mkdir -p "$FINTI" "$TMP/bin"

# --- Comandi finti ---

cat >"$TMP/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"$FINTI/chiamate"
case "$*" in
  *"exec -T db"*) echo "copia finta del database" ;;
  "compose build "*) if [ "${FALLISCI:-}" = "build ${!#}" ]; then echo "build finta fallita"; exit 1; fi ;;
  "inspect "*) echo healthy ;;
esac
exit 0
EOF

cat >"$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "curl $*" >>"$FINTI/chiamate"
indirizzo=""
for argomento in "$@"; do case "$argomento" in http*) indirizzo="$argomento" ;; esac; done
case "$indirizzo" in
  *api.github.com*) if [ -f "$FINTI/release" ]; then cat "$FINTI/release"; else exit 22; fi ;;
  *api.telegram.org*) for argomento in "$@"; do case "$argomento" in text=*) printf '%s\n---\n' "${argomento#text=}" >>"$FINTI/telegram" ;; esac; done ;;
  */api/v1/salute)
    # Il server dice la versione di version.json, tranne quella "rotta"
    versione="$(jq -r .versione version.json)"
    [ "$versione" = "${VERSIONE_ROTTA:-}" ] && versione="0.0.0"
    printf '{"versione":"%s"}' "$versione" ;;
  */version.json*) cat frontend/dist/version.json ;;
esac
EOF

cat >"$TMP/bin/npx" <<'EOF'
#!/usr/bin/env bash
# npx vite build --outDir CARTELLA --emptyOutDir: una build finta con version.json
echo "npx $*" >>"$FINTI/chiamate"
precedente="" uscita=""
for argomento in "$@"; do [ "$precedente" = --outDir ] && uscita="$argomento"; precedente="$argomento"; done
mkdir -p "$uscita"
rm -rf "${uscita:?}"/*
jq -c '{versione, build}' ../version.json >"$uscita/version.json"
echo '<!doctype html>' >"$uscita/index.html"
EOF

cat >"$TMP/bin/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm $*" >>"$FINTI/chiamate"
mkdir -p frontend/node_modules
EOF
chmod +x "$TMP/bin/"*

# --- Repository di prova ---

git init -q --bare -b master "$TMP/origine.git"
git clone -q "$TMP/origine.git" "$TMP/sviluppo" 2>/dev/null
cd "$TMP/sviluppo" || exit 1
mkdir -p deploy frontend/src bot nginx
cp "$QUI/../rilascio.sh" deploy/rilascio.sh
printf '.env\nfrontend/dist/\nfrontend/node_modules/\n' >.gitignore
echo 'codice' >frontend/src/app.js
echo 'bot' >bot/bot.js
echo 'nginx' >nginx/nginx.conf

# Una versione nuova su master, con il suo tag. $1 versione, poi i file da cambiare
nuova_versione() {
  local versione="$1" file
  shift
  for file in "$@"; do echo "$versione" >>"$file"; done
  jq -n --arg v "$versione" '{versione: $v, build: "2026-10-11", changelog: [{versione: $v, modifiche: ["Novità della \($v)"]}]}' >version.json
  git add -A && git commit -qm "$versione" && git tag "v$versione" && git push -q origin master "v$versione" 2>/dev/null
}
nuova_versione 1.2.0
git clone -q "$TMP/origine.git" "$TMP/produzione" 2>/dev/null
printf 'TELEGRAM_BOT_TOKEN=finto\nRILASCI_TELEGRAM_CHAT_ID="42"\n' >"$TMP/produzione/.env"

# --- Come si lancia lo script, e cosa si controlla ---

rilascia() {
  : >"$FINTI/chiamate"
  : >"$FINTI/telegram"
  (cd "$TMP/produzione" && PATH="$TMP/bin:$PATH" RILASCIO_STATO="$TMP/stato" RILASCIO_BACKUP="$TMP/backup" \
    RILASCIO_URL=http://finto RILASCIO_REPO=prova/gymmaster bash deploy/rilascio.sh "$@" </dev/null >"$TMP/uscita" 2>&1)
}
pubblica() { echo "{\"tag_name\":\"$1\"}" >"$FINTI/release"; }
installata() { jq -r .versione "$TMP/produzione/version.json"; }
sito() { jq -r .versione "$TMP/produzione/frontend/dist/version.json" 2>/dev/null; }
chiamato() { grep -qF -- "$1" "$FINTI/chiamate"; }
messaggio() { grep -qF -- "$1" "$FINTI/telegram"; }
nessun_messaggio() { [ ! -s "$FINTI/telegram" ]; }

riusciti=0
falliti=0
prova() {
  local descrizione="$1"
  shift
  if "$@"; then
    riusciti=$((riusciti + 1))
  else
    falliti=$((falliti + 1))
    echo "✖ $descrizione"
    echo "  --- telegram:"; sed 's/^/  /' "$FINTI/telegram"
    echo "  --- log:"; tail -n 25 "$TMP/stato/rilascio.log" 2>/dev/null | sed 's/^/  /'
  fi
}

# --- Le prove ---

rilascia
prova "senza release non fa niente" eval '[ "$(installata)" = 1.2.0 ] && nessun_messaggio && ! chiamato docker'

nuova_versione 1.2.1 frontend/src/app.js
pubblica v1.2.1
rilascia
prova "una release nuova si installa" eval '[ "$(installata)" = 1.2.1 ] && [ "$(sito)" = 1.2.1 ]'
prova "e avvisa su Telegram con le novità" eval 'messaggio "✅ GymMaster 1.2.1 installata" && messaggio "• Novità della 1.2.1"'
prova "prima copia il database" eval 'ls "$TMP"/backup/gymmaster-*-prima-di-v1.2.1.dump >/dev/null'
prova "ricrea il backend e applica le storie" eval 'chiamato "compose build backend" && chiamato "up -d --no-deps --force-recreate backend" && chiamato "exec -T backend node src/applica-novita.js"'
prova "bot, scraper e nginx non cambiati non si toccano" eval '! chiamato "build bot" && ! chiamato "build scraper" && ! chiamato "nginx -t"'
prova "il frontend si costruisce fuori dal sito" eval 'chiamato "npx vite build --outDir $TMP/stato/dist"'

rilascia
prova "la stessa release non si reinstalla" eval 'nessun_messaggio && ! chiamato docker'

pubblica v1.1.0
rilascia
prova "una release piu' vecchia non si installa" eval '[ "$(installata)" = 1.2.1 ] && nessun_messaggio'

nuova_versione 1.2.2 bot/bot.js nginx/nginx.conf
pubblica v1.2.2
rilascia
prova "se cambiano bot e nginx, si ricostruiscono e si riavviano anche loro" eval '[ "$(installata)" = 1.2.2 ] && chiamato "compose build bot" && chiamato "force-recreate bot" && chiamato "nginx:alpine nginx -t" && chiamato "force-recreate nginx" && ! chiamato "build scraper"'

nuova_versione 1.2.3 frontend/src/app.js
pubblica v1.2.3
export FALLISCI="build backend"
rilascia
unset FALLISCI
prova "una build fallita lascia il sito com'era" eval '[ "$(installata)" = 1.2.2 ] && [ "$(sito)" = 1.2.2 ] && ! chiamato "up -d"'
prova "e lo dice su Telegram" eval 'messaggio "GymMaster 1.2.3 non installata: build del backend. Il sito non è stato toccato, resta la 1.2.2"'
rilascia
prova "una release fallita non si riprova da sola" eval 'nessun_messaggio && [ "$(installata)" = 1.2.2 ]'
rilascia --controlla
prova "--controlla dice che e' fallita" grep -q "fallita l'ultima volta" "$TMP/uscita"
rilascia --installa v1.2.3
prova "--installa la riprova" eval '[ "$(installata)" = 1.2.3 ] && messaggio "✅ GymMaster 1.2.3 installata" && [ ! -f "$TMP/stato/fallita" ]'

nuova_versione 1.2.4 frontend/src/app.js
pubblica v1.2.4
export VERSIONE_ROTTA=1.2.4
rilascia
unset VERSIONE_ROTTA
prova "se dopo il passaggio la versione non torna, si torna alla precedente" eval '[ "$(installata)" = 1.2.3 ] && [ "$(sito)" = 1.2.3 ] && messaggio "È tornata la 1.2.3 e funziona"'

nuova_versione 1.2.5
pubblica v1.2.5
echo "modifica a mano" >>"$TMP/produzione/frontend/src/app.js"
rilascia
prova "con modifiche a mano nella cartella di produzione non installa" eval '[ "$(installata)" = 1.2.3 ] && messaggio "modifiche non salvate" && ! chiamato docker'
git -C "$TMP/produzione" checkout -q -- frontend/src/app.js

git checkout -q -b prova-non-unita
nuova_versione 1.3.0 frontend/src/app.js
git checkout -q master
pubblica v1.3.0
rilascia
prova "una release non ancora su master non si installa" eval '[ "$(installata)" = 1.2.3 ] && messaggio "non e'"'"' su master"'

git tag v1.4.0 && git push -q origin v1.4.0 2>/dev/null
pubblica v1.4.0
rilascia
prova "una release il cui version.json dice altro non si installa" eval '[ "$(installata)" = 1.2.3 ] && messaggio "version.json in v1.4.0 non dice 1.4.0"'

rilascia --installa v1.2.5
prova "a mano si installa anche saltando le fallite" eval '[ "$(installata)" = 1.2.5 ]'

echo
echo "Prove dello script di rilascio: $riusciti riuscite, $falliti fallite"
[ "$falliti" -eq 0 ]
