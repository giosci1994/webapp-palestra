# Staying signed in and training offline

On a phone the browser often unloads the app from memory while the user switches to other apps, and at the gym the network comes and goes. This page explains how the app keeps the session, the workout in progress and the logged sets anyway.

## Staying signed in

- **"Ricorda questo dispositivo"** (Remember this device) on the sign-in page: the refresh token and its cookie last 30 days instead of 7 (`JWT_SCADENZA_REFRESH`). The choice is remembered in `localStorage` (`gymmaster_ricorda_dispositivo`), and every renewal keeps the original duration (`durataGiorni` on the token).
- **Back to the app** (`AuthContesto.jsx`, `visibilitychange`): the app renews the access token through the `httpOnly` cookie, which survives an unloaded tab, and reloads the profile if the page had lost it. If the renewal fails it does not sign out there: the next protected request decides, so a weak signal never interrupts a workout.
- **Rotation tolerance**: the refresh token rotates at most once every 5 minutes, and a device one rotation behind gets the replacement again. Details in [features/authentication.md](features/authentication.md).
- **Last page**: `hooks/useRottaPersistente.js` keeps the current route in `localStorage`, which survives the tab being killed, unlike `sessionStorage`.

## The workout in progress

`WorkoutLive.jsx` saves its progress in `localStorage` (`gymmaster_workout_{sessionId}`): current exercise and set, the fields, the sets done, exercises added on the fly, start time. Writes are debounced (500 ms). The progress is restored when the page opens again, and cleared when the workout ends.

- **"Termina" asks the end time** (`componenti/specifici/FineAllenamento.jsx`, logic in `utils/fineAllenamento.js`): it proposes now, or the time of the last set when it was more than 30 minutes ago (the app closed after the last set, the workout finished hours later). "Adesso" (now) and "Ultima serie" (last set) are exact instants; a time typed by hand is read as the latest at or before now, yesterday for a workout across midnight. It cannot be before the start, in the future, or make the workout longer than 10 hours. The end picked travels with "Termina" (`fine`).
- **A workout already finished** (an end-of-rest notification tapped hours later, another device): the screen says so, with a link to History and "Riprendi" (resume) while the server allows it (`riapribileFinoA`). No stopwatch, and progress left in the browser is cleared.
- **End-of-rest notifications**: the app closes those still showing when the workout ends and when the user comes back to the workout screen.
- **The rest between sets** (`hooks/useTimer.js`, logic in `utils/recupero.js`): the countdown is worked out from the moment the rest ends, not by taking a second off at each tick. In the background or with the screen locked the phone slows down or freezes timers: back in the app the countdown is right at once (it also updates on `visibilitychange`, `pageshow` and `focus`). The end is kept in `localStorage` (`gymmaster_recupero_{sessionId}`), so a rest survives the app being closed and reopened; it is removed when skipped, when it is over and when the workout ends. Beep and vibration only right at the end: coming back later, the push notification has already said it.

## Sets without network

`frontend/src/utils/codaSerie.js`: sets, skipped sets and "Termina" (finish) are written on the phone right away, and sent to the server in order as soon as possible.

- **Storage**: `gymmaster_coda_serie_{userId}`. One queue per user: whoever signs out and whoever signs in on the same phone never swap sets. If the phone refuses to write (storage full, private browsing) the queue stays in memory.
- **Duplicates**: each item has a key (`idClient`). If the response is lost and the item is sent again, the server recognises it and does not log it twice.
- **Times**: each item carries the time it was done (`registrataIl` for sets, `conclusaIl` for "Termina"). When it arrives late, that time counts.
- **Sending**: `hooks/useCodaSerie.js` → `useInvioCoda()` in `LayoutAutenticato`: when the app opens, when the network comes back (`online`), when the user comes back to the app, and every 30 seconds while something is left. One sender at a time, across tabs too (`navigator.locks`).
- **Errors**: without network, or with a 401, 408, 429 or 5xx, the item stays and is retried. A 404 means the workout is no longer on the server (open with no sets for a day, the server deletes it): its items become a past workout (`POST /sessioni/passata`). Any other refusal drops the item.
- **Interface**: `WorkoutLive` shows a notice when sets have been waiting for a few seconds. "Termina" without network shows the summary and says the workout will be sent with the network. "Ho chiuso per sbaglio" (closed by mistake) takes "Termina" off the queue if it has not left yet.
- **Limit**: the app has to be opened with network at least once after the workout for the queue to leave. Opening it from scratch without network is not possible yet (it needs the page in the cache and signing in without the server).

## Backend

- **`POST /sessioni/:id/serie`** accepts `idClient` (unique within the workout: a set that already arrived returns the saved one, with 200) and `registrataIl` (kept between the start of the workout and now). A set that arrives when the workout is already finished finishes it again, counting the set: duration, volume and records include it.
- **`PATCH /sessioni/:id/completa`** accepts `conclusaIl`, the time "Termina" was tapped, and `fine`, the end the user picked: it counts instead of the server's estimate, kept between the start and `conclusaIl` (or now). A workout the user already finished is left as it is (`giaConclusa: true`); one the server closed as forgotten is closed again. Closing a workout cancels its pending end-of-rest push.
- **`GET /sessioni/:id`** includes `riapribileFinoA`: until when a finished workout can be resumed (null while it is open).
- **Periodic check** (`conclusioneSessione.service.js`): a workout with no new sets for 2 hours was forgotten open, and is closed at its last set. An open workout with no sets at all is deleted after a day (`ORE_SESSIONE_VUOTA`): its sets may still be queued on a phone without network. Records are dated to the end of the workout, not to the moment it is closed.
- **Schema**: `LogSerie.idClient` (unique with `sessioneId`) and `LogSerie.registrataIl`; `RefreshToken.durataGiorni`.
