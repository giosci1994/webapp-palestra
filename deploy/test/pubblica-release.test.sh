#!/usr/bin/env bash
# ============================================
# GymMaster — Tests of the release button script
# ============================================
#
#   bash deploy/test/pubblica-release.test.sh
#
# A test git repository (with a local "origin") and a fake gh: it answers
# `gh run list` with the tests' state in $FINTI/ci and writes what
# `gh release create` is asked in $FINTI/release. Nothing real is published.
# Needs bash, git and jq.

# shellcheck disable=SC2016 # the checks are strings that eval runs later
set -uo pipefail
QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export FINTI="$TMP/finti" GIT_AUTHOR_NAME=Prova GIT_AUTHOR_EMAIL=prova@esempio.it GIT_COMMITTER_NAME=Prova GIT_COMMITTER_EMAIL=prova@esempio.it
mkdir -p "$FINTI" "$TMP/bin"

cat >"$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "run list")
    # The tests of the commit: "success", "failure", "in_progress" or "nessuno"
    stato="$(cat "$FINTI/ci" 2>/dev/null || echo success)"
    case "$stato" in
      nessuno) echo "nessuno -" ;;
      in_progress) echo "in_progress -" ;;
      *) echo "completed $stato" ;;
    esac ;;
  "release create")
    shift 2
    printf '%s\n' "$@" >"$FINTI/release"
    # The notes file is temporary: keep a copy
    precedente=""
    for argomento in "$@"; do [ "$precedente" = --notes-file ] && cp "$argomento" "$FINTI/note"; precedente="$argomento"; done ;;
esac
EOF
chmod +x "$TMP/bin/gh"

# --- Test repository ---

git init -q --bare -b master "$TMP/origine.git"
git clone -q "$TMP/origine.git" "$TMP/repo" 2>/dev/null
cd "$TMP/repo" || exit 1
mkdir deploy && cp "$QUI/../pubblica-release.sh" deploy/

# version.json with the version $1 and, unless $2 is "senza-voce", its changelog entry
versione() {
  if [ "${2:-}" = senza-voce ]; then
    jq -n --arg v "$1" '{versione: $v, changelog: [{versione: "1.0.0", modifiche: ["Prima"]}]}' >version.json
  else
    jq -n --arg v "$1" '{versione: $v, changelog: [{versione: $v, modifiche: ["Novità \($v)"], modificheEn: ["New in \($v)"]}]}' >version.json
  fi
  git add -A && git commit -qm "$1" && git push -q origin master 2>/dev/null
}

pubblica() {
  rm -f "$FINTI/release" "$FINTI/note"
  (cd "$TMP/repo" && git fetch -q origin && PATH="$TMP/bin:$PATH" GITHUB_STEP_SUMMARY="$TMP/riepilogo" bash deploy/pubblica-release.sh "$@" >"$TMP/uscita" 2>&1)
}
pubblicata() { [ -f "$FINTI/release" ]; }
dice() { grep -qF -- "$1" "$TMP/uscita"; }

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
    sed 's/^/  /' "$TMP/uscita"
  fi
}

# --- The checks ---

versione 1.5.5
git tag v1.5.5 && git push -q origin v1.5.5 2>/dev/null
versione 1.5.6

echo success >"$FINTI/ci"
pubblica --prova
prova "solo prova: controlli superati, note mostrate, niente pubblicato" eval '! pubblicata && dice "controlli superati" && dice "- Novità 1.5.6" && dice "Solo prova"'

pubblica
prova "pubblica v1.5.6 sul commit di master, con le note in inglese e in italiano" eval 'pubblicata && grep -qx v1.5.6 "$FINTI/release" && grep -qx "$(git rev-parse HEAD)" "$FINTI/release" && grep -qx -- --generate-notes "$FINTI/release" && grep -q "^- New in 1.5.6$" "$FINTI/note" && grep -q "^- Novità 1.5.6$" "$FINTI/note"'
prova "e lo scrive nel riepilogo di GitHub" grep -q "Pubblicata v1.5.6" "$TMP/riepilogo"

git tag v1.5.6 && git push -q origin v1.5.6 2>/dev/null
pubblica
prova "una versione già uscita non si ripubblica" eval '! pubblicata && dice "v1.5.6 esiste già"'

versione 1.5.4
pubblica
prova "una versione più vecchia dell'ultima uscita no" eval '! pubblicata && dice "non è più nuova"'

versione 1.6 senza-voce
pubblica
prova "una versione scritta male no" eval '! pubblicata && dice "non è una versione"'

versione 1.6.0 senza-voce
pubblica
prova "senza la voce nel changelog no" eval '! pubblicata && dice "manca la voce della 1.6.0"'

versione 1.6.0
for stato in in_progress failure nessuno; do
  echo "$stato" >"$FINTI/ci"
  pubblica
  prova "con i test \"$stato\" non si pubblica" eval '! pubblicata && dice "test"'
done

echo success >"$FINTI/ci"
git checkout -q -b non-unito && echo x >altro && git add altro && git commit -qm altro
pubblica
prova "un commit che non è su master no" eval '! pubblicata && dice "non è su master"'
git checkout -q master

echo
echo "Prove del pulsante di rilascio: $riusciti riuscite, $falliti fallite"
[ "$falliti" -eq 0 ]
