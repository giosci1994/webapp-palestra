# GymMaster — Riepilogo sessione di lavoro (fino al 2026-07-06)

Documento riassuntivo di un lungo ciclo di sviluppo. Versione finale live: **v1.1.125**.
Stack: React 19 + Vite 8 (rolldown) + Tailwind v4 · Express + Prisma 6 + PostgreSQL 17 + Redis + Socket.io · Bot Telegram grammY · Email via Resend. Deploy via `node build.js` + Docker Compose (pubblico su `gymmaster.casadm.uk` via Cloudflare tunnel). Tutto in italiano, PWA mobile-first.

---

## 1. Rifiniture UI / bug di base
- **Fix spaziature globali (1.1.105):** un reset CSS `*{margin:0;padding:0}` era *fuori* dai layer di Tailwind v4 → annullava tutte le utility `mb-*/mt-*/p-*` in tutta l'app (funzionavano solo i `gap-*`). Spostato in `@layer base` → spaziature ripristinate ovunque.
- Profilo/Statistiche: card e sezioni ora correttamente distanziate; ombra card ammorbidita.

## 2. Fase B — Crescita (Personal Trainer & utenti)
- **Profilo PT pubblico** (`/trainer/:id`) con bio, statistiche, schede pubbliche, CTA iscrizione + endpoint `GET /utenti/personal-trainers/:id`.
- **Pagina "Trova un PT"** (`/trova-pt`) con ricerca + card contestuale in Dashboard (solo per utenti senza PT, non invadente).
- **Sfoglia & clona schede globali:** endpoint `POST /schede/:id/clona` + bottone "⧉ Clona" in DettaglioScheda (preserva i campi cardio).
- **"Diventa PT" dal Profilo** (`POST /utenti/richiedi-pt`) — prima possibile solo in onboarding.
- **Onboarding professionale per PT:** wizard a step dinamici (PT vs utente); step "Presentazione" (bio + specializzazioni) e "Esperienza" (anni, certificazioni, tariffa, contatti). Nuovi campi su `Utente` + mostrati nel profilo pubblico.
- **Registrazione senza attrito (policy decisa con l'utente):** nuovi account creati `ATTIVO` + **auto-login** dopo la registrazione. Il ruolo PT resta vettato dall'admin. (Vedi memoria `policy-approvazioni-account`.)

## 3. Account & accesso
- **Verifica email (Resend):** sistema costruito "dormiente" — si attiva solo con `RESEND_API_KEY` nel `.env`. Poi attivato dall'utente (dominio `casadm.uk` verificato su Resend). Campi `emailVerificata`/token su Utente, pagina `/verifica-email`, login bloccato se non verificato.
- **Recupero password via email:** "Password dimenticata?" nel login → email con link (valido 1h) → `/reimposta-password`. Endpoint `richiedi-reset` / `reimposta-password`, token via `crypto.randomBytes`, invalida le sessioni al reset.

## 4. Chat / presenza / admin
- **Fix presenza chat:** prima l'altro utente risultava sempre "online" (usava la connessione del *proprio* socket). Ora presenza reale via eventi Socket.io `presenza:cambio` + campo `Utente.ultimoAccesso` (lastSeen). Mostra "visto …" quando offline.
- **Admin Gestione Utenti arricchita:** ultima connessione, n. schede/sessioni, palestra, stato verifica email, avatar. **Protezione anti-auto-eliminazione** dell'admin (UI + guardia server `vietaSuSeStesso`).
- **Gestione Novità:** fix layout campo emoji nei "Punti" (era gigante/testo invisibile) + **selettore emoji a griglia**.

## 5. Profilo & dati corporei
- **Foto profilo: carica → ritaglia → comprimi** automaticamente (`react-easy-crop` + canvas ~400px JPEG). Niente più limite 200KB da gestire a mano. In Profilo e onboarding.
- **Composizione corporea con storico** (`MisurazioneCorporea`, serie temporale): peso, grasso, massa muscolare/magra/ossea, acqua, viscerale, sottocutaneo, proteine, BMR, età metabolica. Snapshot + grafico andamento + storico. Inseribile **dall'utente** (`/composizione`) e **dal suo PT** dal dettaglio cliente (autorizzazione `isPTDelCliente`).

## 6. Dashboard PT
- Restyle della Panoramica: **azioni rapide** (crea scheda / appuntamento / annuncio / profilo pubblico), KPI ridisegnati, **anteprima clienti** con ultima attività + empty-state che spinge a condividere il profilo.

## 7. Fase C — Bot Telegram
- **C1 — Notifiche chat:** `telegram.service.js` (sendMessage via bot token) + hook in `chat.gestore.js` → notifica Telegram ai destinatari **offline** collegati.
- **C2 — `/statistiche`:** riepilogo allenamenti (sessioni, volume, ore, record, ultimo allenamento).
- **C3 — Creazione guidata `/guidata`:** wizard a pulsanti per categorie italiane (parte del corpo → gruppo muscolare → esercizio → serie×rip → termina). Risolve i nomi inglesi.
- **C4 — Esercizi più usati:** proposti in cima nella creazione guidata + scorciatoia "⭐ I tuoi più usati".
- **Fix bot:** errore 500 su `/guidata` (filtro Prisma `{not:null}` su campo non-nullable), menu comandi (`setMyCommands`), wording ("scrivimi" invece di "parlami", niente vocali).

## 8. Audit sicurezza & bug — fix applicati (v1.1.124–125)
Fatto un audit (3 agenti Explore) **verificato personalmente** sul codice (scartati molti falsi allarmi degli agenti: Postgres/Redis NON esposti alla LAN, header nginx già presenti, rotte bot già bloccate da nginx 404, ecc.).

**🏋️ BUG #0 — "Token di accesso mancante" durante l'allenamento (1.1.124):**
Causa: al ritorno da background, il refresh in `AuthContesto` poteva fallire per un blip/race → azzerava la sessione; WorkoutLive girava *fuori* dall'area autenticata → chiamate senza token. Fix:
- `api.js`: mai richieste tokenless; su 401+refresh fallito → errore `SESSIONE_SCADUTA` + handler redirect. Aggiunta `refreshSessione()` condivisa.
- `AuthContesto`: refresh condivisi (niente race), tolto il **logout prematuro** del visibility handler (era la causa scatenante).
- `/allenamento/:id` spostato **dentro** `LayoutAutenticato` con modalità immersiva. Progressi salvati in `localStorage` → nessuna perdita.

**🔐 IDOR chiusi (1.1.125):**
- `schede.controller`: `aggiornaEsercizioScheda` / `rimuoviEsercizio` verificano `scheda.creatoreId`.
- `sessioni.controller`: `dettaglioSessione` / `completaSessione` / `logSerie` verificano `utenteId` (+ fix import mancante `ErroreNonAutorizzato`).
- `chat.gestore`: `chat:entra_conversazione` verifica la partecipazione prima del `socket.join`.

**🟠 Altri (1.1.125):** reset password admin → **password temporanea casuale** + log (non più `qwerty123`); profilo gamification pubblico solo `ATTIVO` (+ fix check `stato` non selezionato); bottoni "Reinvia email" senza doppio-submit.

**Fuori scope (hardening non richiesto):** Redis con password, backup DB, pinning immagini, CSP/HSTS, rate-limit extra, limiti Socket.io.

---

## ⚠️ Azioni ancora in carico all'UTENTE
1. **Ruotare i segreti trapelati in chat:** token bot Telegram (BotFather) e `RESEND_API_KEY` (dashboard Resend) → aggiornare `.env` → `docker compose up -d --force-recreate backend bot`. Consigliato cambiare anche `SUPERADMIN_PASSWORD`.
2. **Testare sul telefono:** fix allenamento (blocco schermo → "avanti"), recupero password, `/guidata` sul bot.

## Riferimenti
- Deploy: `node build.js patch` → `docker compose up -d --build backend` → `docker compose up -d --force-recreate nginx` (mai `vite build` diretto). Bot/backend: `--build bot backend`.
- Memorie in `/home/pi/.claude/projects/-home-pi-Web-App-Palestra/memory/` (deploy, mobile-first, policy-approvazioni-account).
