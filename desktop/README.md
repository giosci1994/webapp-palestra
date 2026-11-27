# GymMaster for Windows

A [Tauri 2](https://v2.tauri.app/) window that shows https://gymmaster.casadm.uk/, with an NSIS installer (`gymmaster-windows-setup.exe`, no administrator rights needed). It uses the WebView2 that Windows 10 and 11 already have.

- The site gets **no** Tauri permission: there are no capabilities, so its JavaScript cannot call the app. Links to other sites open in the system browser.
- Updates: the site updates itself like the PWA. The frame checks `latest.json` in the latest GitHub release at start and every 6 hours; when the version is newer it asks, downloads the installer, checks its signature against the public key in `src-tauri/tauri.conf.json` and installs it. The private key is only in the `app` environment of the repository.
- The version is `version.json`'s, written into `tauri.conf.json` by `.github/workflows/app.yml` at build time: the `0.0.0` in the repository is a placeholder.
- The installer is not signed with a code-signing certificate: Windows SmartScreen warns the first time ("More info → Run anyway").

## Building it

On Windows, with Rust (MSVC) and Node 22:

```bash
cd desktop
npm ci
npm run icone          # src-tauri/icons/ from the web app's icon (not in git)
npm run build -- --bundles nsis
```

Without `TAURI_SIGNING_PRIVATE_KEY` the build stops at the updater signature: for a local test make a throwaway key with `npx tauri signer generate -w <file>` and point the variable to it. On Linux `cargo check` in `src-tauri/` works with the WebKitGTK development packages.
