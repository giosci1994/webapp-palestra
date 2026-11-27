#!/usr/bin/env bash
# ============================================
# GymMaster — Build and sign the Android app (TWA)
# ============================================
#
#   android/costruisci.sh <version> <output.apk>
#
# Run by .github/workflows/app.yml; it works the same on a computer with
# JDK 17, the Android SDK and Node. Bubblewrap only generates the Android
# project from android/twa-manifest.json, in a temporary folder (the
# repository stays clean); Gradle builds it and apksigner signs it.
# Bubblewrap's own `build` is not used: it asks questions when something is
# missing and passes the passwords on a shell command line, apksigner reads
# them from the environment instead.
#
# Environment:
#   JAVA_HOME, ANDROID_HOME          JDK 17 and the Android SDK
#   ANDROID_KEYSTORE                 path of the keystore (PKCS12 or JKS)
#   ANDROID_KEY_ALIAS                alias of the key
#   ANDROID_KEYSTORE_PASSWORD        never printed: apksigner reads them
#   ANDROID_KEY_PASSWORD             with env:, not from the command line
#   BUBBLEWRAP                       optional, the command that runs Bubblewrap
#
# Version: <version> is version.json's (x.y.z): appVersion is the same,
# appVersionCode is major*10000 + minor*100 + patch (it only has to grow).

set -euo pipefail

errore() {
  echo "::error::$1" >&2
  exit 1
}

[ $# -eq 2 ] || errore "uso: android/costruisci.sh <versione> <file.apk>"
versione="$1"
uscita="$(realpath -m "$2")"
cartella="$(cd "$(dirname "$0")" && pwd)"

[[ "$versione" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || errore "versione \"$versione\": serve x.y.z"
maggiore="${BASH_REMATCH[1]}"; minore="${BASH_REMATCH[2]}"; patch="${BASH_REMATCH[3]}"
# 10# so that 08 or 09 are not read as octal
if [ $((10#$minore)) -ge 100 ] || [ $((10#$patch)) -ge 100 ]; then
  errore "versione $versione: minore e patch devono stare sotto 100 per il versionCode"
fi
codice=$((10#$maggiore * 10000 + 10#$minore * 100 + 10#$patch))

for variabile in JAVA_HOME ANDROID_HOME ANDROID_KEYSTORE ANDROID_KEY_ALIAS ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD; do
  [ -n "${!variabile:-}" ] || errore "manca $variabile"
done
[ -f "$ANDROID_KEYSTORE" ] || errore "il keystore non c'è: $ANDROID_KEYSTORE"

# The newest build-tools in the SDK: zipalign and apksigner
strumenti="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
[ -x "$strumenti/apksigner" ] || errore "apksigner non trovato in $ANDROID_HOME/build-tools"

read -r -a bubblewrap <<<"${BUBBLEWRAP:-npx --yes @bubblewrap/cli@1.27.0}"

lavoro="$(mktemp -d)"
trap 'rm -rf "$lavoro"' EXIT

jq --arg v "$versione" --argjson c "$codice" '.appVersion = $v | .appVersionCode = $c' \
  "$cartella/twa-manifest.json" >"$lavoro/twa-manifest.json"
# Bubblewrap asks where JDK and SDK are unless its configuration says so
jq -n --arg jdk "$JAVA_HOME" --arg sdk "$ANDROID_HOME" '{jdkPath: $jdk, androidSdkPath: $sdk}' >"$lavoro/bubblewrap.json"

echo "Android $versione (versionCode $codice): genero il progetto"
mkdir "$lavoro/progetto"
"${bubblewrap[@]}" update --skipVersionUpgrade --config="$lavoro/bubblewrap.json" \
  --manifest="$lavoro/twa-manifest.json" --directory="$lavoro/progetto"

echo "Compilo"
(cd "$lavoro/progetto" && ./gradlew --no-daemon --quiet assembleRelease)
grezzo="$lavoro/progetto/app/build/outputs/apk/release/app-release-unsigned.apk"
[ -f "$grezzo" ] || errore "Gradle non ha prodotto l'APK"

echo "Allineo e firmo"
"$strumenti/zipalign" -f -p 4 "$grezzo" "$lavoro/allineato.apk"
mkdir -p "$(dirname "$uscita")"
"$strumenti/apksigner" sign --ks "$ANDROID_KEYSTORE" --ks-key-alias "$ANDROID_KEY_ALIAS" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD \
  --v4-signing-enabled false --out "$uscita" "$lavoro/allineato.apk"
"$strumenti/apksigner" verify "$uscita"

# The fingerprint Android compares with the site's assetlinks.json (public)
impronta="$("$strumenti/apksigner" verify --print-certs "$uscita" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')"
echo "Firmato: $uscita"
echo "Impronta SHA-256: $impronta"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "impronta=$impronta" >>"$GITHUB_OUTPUT"
fi
