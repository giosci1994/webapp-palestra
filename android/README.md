# GymMaster for Android

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity): an Android app that opens https://gymmaster.casadm.uk/ full screen, through Chrome, without the address bar. The site inside keeps updating itself like the PWA; a new APK is only needed when the frame changes (name, icon, colours, Android settings).

- `twa-manifest.json` is the whole project: package `uk.casadm.gymmaster` (it can never change once users have installed it), name, colours, icons. [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) generates the Android project from it at every build.
- `costruisci.sh <version> <file.apk>` generates the project in a temporary folder, builds it with Gradle and signs it with apksigner. The version is `version.json`'s: `appVersion` is the same, `appVersionCode` is `major*10000 + minor*100 + patch`. The values in `twa-manifest.json` are placeholders.
- The release APK is built and signed by `.github/workflows/app.yml` with the key in the `app` environment. The key's SHA-256 fingerprint must be in `frontend/public/.well-known/assetlinks.json`, or the app opens with the address bar: the workflow checks it.

## Building it on a computer

JDK 17 (not newer), the Android SDK, Node 22 and `jq`. With a test key (never the real one):

```bash
keytool -genkeypair -storetype PKCS12 -keystore /tmp/test.p12 -alias test -keyalg RSA -keysize 2048 -validity 2 -dname "CN=test"
export JAVA_HOME=... ANDROID_HOME=... ANDROID_KEYSTORE=/tmp/test.p12 ANDROID_KEY_ALIAS=test
export ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_PASSWORD=...
android/costruisci.sh 1.7.0 /tmp/gymmaster-android.apk
```

An APK signed with another key installs, but opens with the address bar.
