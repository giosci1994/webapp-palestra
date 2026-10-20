#!/usr/bin/env bash
# ============================================
# GymMaster — Publish the release of the version in version.json
# ============================================
#
# Run by the "Rilascia" button (Actions → Rilascia → Run workflow,
# .github/workflows/rilascia.yml) on the tip of master; the server then
# installs it (deploy/rilascio.sh). It can run by hand too, with gh logged in.
#
#   deploy/pubblica-release.sh          checks, then publishes v<version>
#   deploy/pubblica-release.sh --prova  checks and shows the notes, publishes nothing
#
# Before publishing it checks that the version is well formed and newer than
# every release, its tag does not exist yet, the commit is on master, the
# changelog has its entry, and the tests (workflow test.yml) on that commit
# finished green. The notes are the changelog entry (English and Italian),
# followed by the ones GitHub generates (the merged pull requests).
# The messages are Italian: they are for whoever presses the button.

set -euo pipefail

prova=false
[ "${1:-}" = "--prova" ] && prova=true

errore() {
  echo "::error::$1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "❌ $1" >>"$GITHUB_STEP_SUMMARY"
  exit 1
}

versione="$(jq -r '.versione' version.json)"
tag="v$versione"
commit="$(git rev-parse HEAD)"

[[ "$versione" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || errore "version.json dice \"$versione\": non è una versione come 1.5.6"

git merge-base --is-ancestor "$commit" origin/master || errore "il commit ${commit:0:7} non è su master: si rilascia solo codice già unito"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  errore "$tag esiste già: per una versione nuova cambia \"versione\" in version.json"
fi

ultima="$(git tag -l 'v*' | sed 's/^v//' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)"
if [ -n "$ultima" ] && [ "$(printf '%s\n%s\n' "$ultima" "$versione" | sort -V | tail -n 1)" != "$versione" ]; then
  errore "$versione non è più nuova dell'ultima uscita ($ultima)"
fi

voce="$(jq -c --arg v "$versione" '.changelog[] | select(.versione == $v)' version.json | head -n 1)"
[ -n "$voce" ] && [ "$(jq '.modifiche | length' <<<"$voce")" -gt 0 ] || errore "nel changelog di version.json manca la voce della $versione"

# The tests of this exact commit: finished, and green
read -r stato esito < <(gh run list --workflow test.yml --commit "$commit" --limit 1 --json status,conclusion \
  --jq '.[0] | "\(.status // "nessuno") \(.conclusion // "-")"' 2>/dev/null || echo "nessuno -")
case "$stato" in
  nessuno|"") errore "nessun giro dei test per ${commit:0:7}: aspetta che partano dopo il merge, poi riprova" ;;
  completed) [ "$esito" = "success" ] || errore "i test di ${commit:0:7} sono finiti con \"$esito\": sistemali prima di rilasciare" ;;
  *) errore "i test di ${commit:0:7} sono ancora in corso ($stato): riprova quando finiscono" ;;
esac

note="$(mktemp)"
{
  if [ "$(jq '.modificheEn // [] | length' <<<"$voce")" -gt 0 ]; then
    echo "## What's new"
    jq -r '.modificheEn[] | "- " + .' <<<"$voce"
    echo
  fi
  echo "## Novità"
  jq -r '.modifiche[] | "- " + .' <<<"$voce"
  echo
} >"$note"

echo "Versione $versione, commit ${commit:0:7}: controlli superati."
cat "$note"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### $tag — ${commit:0:7}"; echo; cat "$note"; } >>"$GITHUB_STEP_SUMMARY"
fi

if $prova; then
  echo "Solo prova: nessuna release pubblicata."
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "🧪 Solo prova: nessuna release pubblicata." >>"$GITHUB_STEP_SUMMARY"
  exit 0
fi

gh release create "$tag" --target "$commit" --title "$tag" --notes-file "$note" --generate-notes
echo "Pubblicata $tag: il server la installa entro un paio di minuti e lo scrive su Telegram."
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "✅ Pubblicata $tag: il server la installa entro un paio di minuti." >>"$GITHUB_STEP_SUMMARY"
exit 0
