// GymMaster for Windows: one window that shows the web app, nothing else.
// The site updates itself like the PWA; this frame only checks, at start and
// then every few hours, whether a newer installer is out (latest.json in the
// GitHub releases), asks, and installs it. The site gets no Tauri permission:
// there are no capabilities, only this Rust code uses the updater.

// No console window behind the app in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const SITO: &str = "https://gymmaster.casadm.uk/";
const HOST: &str = "gymmaster.casadm.uk";
const OGNI: Duration = Duration::from_secs(6 * 60 * 60);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let per_navigazione = app.handle().clone();
            let per_finestre = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITO.parse()?))
                .title("GymMaster")
                .inner_size(1100.0, 800.0)
                .min_inner_size(360.0, 560.0)
                .on_navigation(move |url| resta_nella_finestra(&per_navigazione, url))
                // Links that open a new window (target="_blank"): the browser
                .on_new_window(move |url, _| {
                    apri_fuori(&per_finestre, &url);
                    NewWindowResponse::Deny
                })
                .build()?;

            let handle = app.handle().clone();
            std::thread::spawn(move || controlla_aggiornamenti(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running GymMaster");
}

/// The window stays on the site: any other address (GitHub, Telegram, a
/// donation page) opens in the system browser or app instead.
fn resta_nella_finestra(app: &AppHandle, url: &Url) -> bool {
    if url.scheme() == "https" && url.host_str() == Some(HOST) {
        return true;
    }
    apri_fuori(app, url);
    false
}

/// Web pages, e-mail and Telegram links go to the system; anything else
/// (file:, javascript:, custom schemes) is dropped.
fn apri_fuori(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tg") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// Checks now and then every few hours. A version the user postponed is not
/// asked about again until the app restarts. Errors (offline, GitHub down)
/// are ignored: the next check tries again.
fn controlla_aggiornamenti(app: AppHandle) {
    let mut rimandata: Option<String> = None;
    loop {
        if let Err(errore) = tauri::async_runtime::block_on(controlla(&app, &mut rimandata)) {
            eprintln!("update check failed: {errore}");
        }
        std::thread::sleep(OGNI);
    }
}

async fn controlla(
    app: &AppHandle,
    rimandata: &mut Option<String>,
) -> tauri_plugin_updater::Result<()> {
    let Some(aggiornamento) = app.updater()?.check().await? else {
        return Ok(());
    };
    if rimandata.as_deref() == Some(aggiornamento.version.as_str()) {
        return Ok(());
    }
    let testi = Testi::della_lingua();
    let si = app
        .dialog()
        .message((testi.domanda)(&aggiornamento.version))
        .title("GymMaster")
        .buttons(MessageDialogButtons::OkCancelCustom(
            testi.aggiorna.into(),
            testi.dopo.into(),
        ))
        .blocking_show();
    if !si {
        *rimandata = Some(aggiornamento.version.clone());
        return Ok(());
    }
    // The installer's signature is checked against the public key in
    // tauri.conf.json before it runs; on Windows the app closes to install
    aggiornamento.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}

/// The frame's only texts, in the system language: English, or Italian.
struct Testi {
    domanda: fn(&str) -> String,
    aggiorna: &'static str,
    dopo: &'static str,
}

impl Testi {
    fn della_lingua() -> Self {
        let italiano =
            sys_locale::get_locale().is_some_and(|lingua| lingua.to_lowercase().starts_with("it"));
        if italiano {
            Testi {
                domanda: |versione| {
                    format!("È disponibile GymMaster {versione}. Aggiornare adesso?")
                },
                aggiorna: "Aggiorna",
                dopo: "Più tardi",
            }
        } else {
            Testi {
                domanda: |versione| format!("GymMaster {versione} is available. Update now?"),
                aggiorna: "Update",
                dopo: "Later",
            }
        }
    }
}
