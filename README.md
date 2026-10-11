# 🏋️ GymMaster

<p align="center">
  <a href="https://github.com/giosci1994/webapp-palestra/actions/workflows/test.yml"><img src="https://github.com/giosci1994/webapp-palestra/actions/workflows/test.yml/badge.svg" alt="Test" /></a>
  <a href="https://github.com/giosci1994/webapp-palestra/releases/latest"><img src="https://img.shields.io/github/v/release/giosci1994/webapp-palestra" alt="Ultima versione" /></a>
  <img src="https://img.shields.io/badge/licenza-GPLv3-blue.svg" alt="Licenza GPLv3" />
  <a href="https://buymeacoffee.com/giosci1994u"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

GymMaster è una web app per la palestra, da installare sul proprio server con Docker. Ci si allena dal telefono (anche senza rete), si seguono progressi e record, e la palestra intera ci sta dentro: personal trainer, chat, affluenza in tempo reale, bot Telegram.

È una PWA in italiano: si aggiunge alla schermata Home come un'app, manda notifiche anche ad app chiusa e si aggiorna da sola quando esce una versione nuova.

> **In English:** GymMaster is a self-hosted gym web app (Italian UI). Members log workouts from their phone, even offline, with load progression, warm-up ramps and drop sets; stats, personal records and body composition; personal trainers manage clients and plans; real-time chat, live gym crowd levels, a Telegram bot and an AI assistant. React PWA, Node.js/Express, PostgreSQL, Redis, Docker Compose. Project page: [giosci1994.github.io/webapp-palestra](https://giosci1994.github.io/webapp-palestra/).

## 📸 Schermate

| Accesso e profilo | Dashboard e schede | Allenamento e bot |
|:---:|:---:|:---:|
| <img src="docs/pics/Login.jpg" width="250" alt="Accesso" /><br><em>Accesso</em> | <img src="docs/pics/Home.jpg" width="250" alt="Dashboard" /><br><em>Dashboard</em> | <img src="docs/pics/Inizio_allenamento.jpg" width="250" alt="Inizio allenamento" /><br><em>Inizio allenamento</em> |
| <img src="docs/pics/Registrazione.jpg" width="250" alt="Registrazione" /><br><em>Registrazione</em> | <img src="docs/pics/Home-BotAI.jpg" width="250" alt="Assistente AI" /><br><em>Assistente AI</em> | <img src="docs/pics/Allenamento.jpg" width="250" alt="Allenamento" /><br><em>Allenamento in corso</em> |
| <img src="docs/pics/Profilo.jpg" width="250" alt="Profilo" /><br><em>Profilo</em> | <img src="docs/pics/Statistiche.jpg" width="250" alt="Statistiche" /><br><em>Statistiche</em> | <img src="docs/pics/Allenamento_con_video.jpg" width="250" alt="Video dell'esercizio" /><br><em>Video dell'esercizio</em> |
| <img src="docs/pics/News_notifiche.jpg" width="250" alt="Novità e notifiche" /><br><em>Novità e notifiche</em> | <img src="docs/pics/Gestione_schede.jpg" width="250" alt="Gestione schede" /><br><em>Gestione schede</em> | <img src="docs/pics/Bot_telegram.jpg" width="250" alt="Bot Telegram" /><br><em>Bot Telegram</em> |

## ✨ Cosa fa

**Allenamento**
- Schermata pensata per il telefono in palestra: timer di recupero (la notifica arriva anche a schermo bloccato), schermo sempre acceso, video dell'esercizio.
- **Proposta del carico**: dalle ultime volte l'app propone quanto caricare oggi e spiega perché (doppia progressione, con scarico dopo tre volte di fila sotto la forbice).
- **Riscaldamento e drop set**: la rampa di riscaldamento verso il peso di oggi, a un tocco per passo; i drop si aggiungono alla serie. Il riscaldamento non conta in volume, serie e record.
- **Anche senza rete**: serie e fine allenamento restano sul telefono e partono da sole quando torna la connessione, una volta sola e con l'ora giusta.
- "L'ultima volta" per ogni serie, calcolo dei dischi per lato, esercizi aggiunti al volo.
- Riprendi un allenamento chiuso per sbaglio, correggi uno concluso, registra uno fatto senza app, salvane uno come scheda. Quelli lasciati aperti si chiudono da soli all'ultima serie.

**Schede e pianificazione**
- Schede personali e globali, con note tecniche per esercizio; si clonano e si scaricano in Word (.docx).
- Calendario delle schede programmate, promemoria e notifiche nella campanella.
- Catalogo di oltre 3.300 esercizi con nome italiano (e l'originale inglese), ricerca tollerante agli errori e preferiti.

**Progressi**
- Statistiche: muscoli allenati e in recupero, andamento di ogni esercizio, massimali stimati, record personali, attività dell'anno, frequenza settimanale.
- Composizione corporea nel tempo (peso, grasso, muscolo, acqua, BMR…), anche inserita dal personal trainer.
- Gamification: XP, livelli, badge e classifiche (si può spegnere).

**La palestra**
- **Personal trainer**: clienti e richieste, appuntamenti, schede assegnate, annunci, misurazioni.
- **Chat** in tempo reale fra utenti e con il proprio PT.
- **Affluenza**: quanto è piena la palestra adesso e gli orari migliori (dati di Google Maps).
- **Bot Telegram**: schede, statistiche, creazione guidata di una scheda e notifiche dei messaggi.
- **Assistente AI** (Google Gemini) che conosce i tuoi allenamenti.

**Account e privacy**
- Accesso con password o **passkey** (impronta, volto, PIN), elenco dei dispositivi collegati.
- Verifica dell'email e recupero della password (con [Resend](https://resend.com)).
- Esporta tutti i tuoi dati o elimina l'account; privacy, termini e cookie.
- Pannello admin: utenti, palestre, esercizi, suggerimenti degli utenti, novità e banner.

## 🧱 Come è fatta

```text
                  ┌─────────────── Docker Compose ───────────────┐
 telefono / PC ──▶│ nginx :6969 ──▶ frontend/dist (PWA React)     │
                  │      │                                        │
                  │      └─ /api, /socket.io ──▶ backend :3000 ─┬─▶ PostgreSQL 17
                  │                                 ▲           └─▶ Redis 7
                  │ bot (Telegram) ─────────────────┘                │
                  │ scraper (affluenza, ogni 30 min) ──▶ PostgreSQL  │
                  └──────────────────────────────────────────────────┘
```

| Parte | Tecnologia |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Framer Motion, Recharts; PWA con Web Push |
| Backend | Node.js 22, Express 4, Prisma 6, Socket.io 4 |
| Dati | PostgreSQL 17, Redis 7 |
| Sicurezza | Argon2id, passkey (WebAuthn), JWT con rinnovo a rotazione, Helmet, limiti di richieste |
| Bot | grammY (Telegram) |
| Scraper | Playwright |
| Infrastruttura | Docker Compose, Nginx |

### Struttura del repository

```text
webapp-palestra/
├── frontend/         App React (pagine, componenti, hook, utils con i loro test)
├── backend/          API Express + Socket.io, test (node:test)
│   └── prisma/       Schema, migrazioni, seed, catalogo esercizi e storie delle novità
├── bot/              Bot Telegram: inoltra al backend
├── scraper/          Affluenza delle palestre da Google Maps
├── nginx/            Serve il frontend e passa /api e /socket.io al backend
├── deploy/           Rilascio automatico sul server, con le sue prove
├── docs/             Documentazione delle funzioni, immagini, sito del progetto
├── .github/          CI (test, immagini Docker, rilascio) e template
├── docker-compose.yml
├── version.json      Versione dell'app e novità per gli utenti
└── .env.esempio      Tutte le variabili d'ambiente, commentate
```

## 🚀 Installazione

Servono [Docker](https://docs.docker.com/get-docker/) con Compose e Node.js 22 (per costruire il frontend).

```bash
git clone https://github.com/giosci1994/webapp-palestra.git
cd webapp-palestra

# 1. Variabili d'ambiente: cambia almeno password, segreti JWT, APP_URL e ORIGINI_CONSENTITE
cp .env.esempio .env

# 2. Il frontend: nginx serve la cartella frontend/dist
(cd frontend && npm ci && npm run build)

# 3. Database, backend e nginx
docker compose up -d --build db redis backend nginx
```

Al primo avvio il backend applica le migrazioni e riempie il database: l'amministratore (`SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` del `.env`), le attrezzature, il catalogo degli esercizi, alcune palestre e le schede di esempio. L'app risponde su **http://localhost:6969**.

Il bot e lo scraper sono facoltativi. Il bot vuole `TELEGRAM_BOT_TOKEN` e `BOT_SECRET`. Lo scraper legge l'affluenza delle palestre che hanno un Google Place ID: per cercarli una volta per tutte le palestre che non lo hanno, c'è `scraper/trova-place-ids.js`. Quando sono configurati:

```bash
docker compose up -d --build bot scraper
docker compose run --rm --entrypoint node scraper trova-place-ids.js   # una volta, per i Place ID
```

Per usarla da fuori casa serve HTTPS su un dominio, per esempio con un tunnel Cloudflare o un reverse proxy davanti a nginx. Le passkey funzionano solo sul dominio di `APP_URL`.

Funzioni che restano spente finché non ne imposti la chiave nel `.env`: assistente AI (`GEMINI_API_KEY`), email (`RESEND_API_KEY`), notifiche push (`VAPID_CHIAVE_PUBBLICA` e `VAPID_CHIAVE_PRIVATA`). Ogni variabile è spiegata in [`.env.esempio`](.env.esempio).

## 💻 Sviluppo

Postgres e Redis in Docker, backend e frontend sul tuo computer con il ricaricamento automatico:

```bash
docker run -d --name gymmaster-dev-db -p 5432:5432 \
  -e POSTGRES_USER=gymmaster -e POSTGRES_PASSWORD=gymmaster -e POSTGRES_DB=gymmaster postgres:17-alpine
docker run -d --name gymmaster-dev-redis -p 6379:6379 redis:7-alpine

# Backend: un backend/.env con DATABASE_URL=postgresql://gymmaster:gymmaster@localhost:5432/gymmaster,
# REDIS_URL=redis://localhost:6379, i due segreti JWT e ORIGINI_CONSENTITE=http://localhost:5173
cd backend && npm ci
npx prisma migrate deploy && npx prisma db seed
npm run dev                     # http://localhost:3000

# Frontend, in un altro terminale
cd frontend && npm ci && npm run dev   # http://localhost:5173, /api va al backend
```

Una modifica a `backend/prisma/schema.prisma` va con la sua migrazione (`npx prisma migrate dev --name ...`). Le regole del progetto sono in [`CLAUDE.md`](CLAUDE.md) e [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🧪 Test

```bash
# Backend: unitari e d'integrazione. Serve Docker: avviano un Postgres e un
# Redis usa-e-getta e non toccano mai il database vero
cd backend && npm test
cd backend && npm run test:unitari      # solo unitari, senza Docker

# Frontend: test (Vitest) e ESLint, a zero errori e zero avvisi
cd frontend && npm test && npm run lint

# Lo script di rilascio, con docker, curl e npm finti
bash deploy/test/rilascio.test.sh
```

Ogni pull request li esegue su GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)), insieme alla costruzione delle immagini Docker e all'avvio del backend su un database vuoto.

## 📦 Rilasci

La versione dell'app sta in [`version.json`](version.json), con le novità scritte per gli utenti. Quando su GitHub esce una release (tag `v` + la versione, da `master`), il server la installa da solo con [`deploy/rilascio.sh`](deploy/rilascio.sh): copia del database, migrazioni, frontend, controlli e messaggio su Telegram; se qualcosa va storto torna alla versione di prima. Tutti i dettagli in [`deploy/README.md`](deploy/README.md).

## 📚 Documentazione

- [`docs/funzioni/`](docs/funzioni/): autenticazione, chat, assistente AI, profilo, storico degli allenamenti e altre funzioni
- [`docs/persistenza-sessione-mobile.md`](docs/persistenza-sessione-mobile.md): sessione sul telefono e allenamento senza rete
- [`docs/importazione-esercizi.md`](docs/importazione-esercizi.md): come è stato costruito il catalogo degli esercizi
- [`docs/spaziature.md`](docs/spaziature.md) e [`docs/struttura_dashboard_v2.md`](docs/struttura_dashboard_v2.md): regole di layout dell'interfaccia
- [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma): il modello dei dati, commentato

## 🤝 Contribuire

Issue e pull request sono benvenute: leggi [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ☕ Supporto

Se GymMaster ti è utile, puoi offrirmi un caffè.

<a href="https://buymeacoffee.com/giosci1994u"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="45" alt="Buy Me a Coffee" /></a>

## 📄 Licenza

Software libero sotto licenza [GNU General Public License v3.0](LICENSE).
