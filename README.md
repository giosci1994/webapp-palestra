# 🏋️ GymMaster

<p align="center">
  <a href="https://github.com/giosci1994/webapp-palestra/actions/workflows/test.yml"><img src="https://github.com/giosci1994/webapp-palestra/actions/workflows/test.yml/badge.svg" alt="Tests" /></a>
  <a href="https://github.com/giosci1994/webapp-palestra/releases/latest"><img src="https://img.shields.io/github/v/release/giosci1994/webapp-palestra" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License GPLv3" />
  <a href="https://buymeacoffee.com/giosci1994u"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

GymMaster is a gym web app you host on your own server with Docker. Members log their workouts from the phone, even offline, and follow their progress and records. The whole gym fits in it: personal trainers, chat, live crowd levels, a Telegram bot and an AI assistant.

It is a PWA: it goes on the home screen like an app, sends notifications even when closed and updates itself when a new version comes out.

> **Languages:** English and Italian. The app follows the phone's language and can be switched in Profile. Adding a language takes a folder of JSON files: see [docs/translations.md](docs/translations.md).

Project page: [giosci1994.github.io/webapp-palestra](https://giosci1994.github.io/webapp-palestra/).

## 📸 Screenshots

| Sign-in and profile | Dashboard and plans | Workout and bot |
|:---:|:---:|:---:|
| <img src="docs/pics/Login.jpg" width="250" alt="Sign-in" /><br><em>Sign-in</em> | <img src="docs/pics/Home.jpg" width="250" alt="Dashboard" /><br><em>Dashboard</em> | <img src="docs/pics/Inizio_allenamento.jpg" width="250" alt="Starting a workout" /><br><em>Starting a workout</em> |
| <img src="docs/pics/Registrazione.jpg" width="250" alt="Sign-up" /><br><em>Sign-up</em> | <img src="docs/pics/Home-BotAI.jpg" width="250" alt="AI assistant" /><br><em>AI assistant</em> | <img src="docs/pics/Allenamento.jpg" width="250" alt="Workout in progress" /><br><em>Workout in progress</em> |
| <img src="docs/pics/Profilo.jpg" width="250" alt="Profile" /><br><em>Profile</em> | <img src="docs/pics/Statistiche.jpg" width="250" alt="Statistics" /><br><em>Statistics</em> | <img src="docs/pics/Allenamento_con_video.jpg" width="250" alt="Exercise video" /><br><em>Exercise video</em> |
| <img src="docs/pics/News_notifiche.jpg" width="250" alt="What's new and notifications" /><br><em>What's new and notifications</em> | <img src="docs/pics/Gestione_schede.jpg" width="250" alt="Managing plans" /><br><em>Managing plans</em> | <img src="docs/pics/Bot_telegram.jpg" width="250" alt="Telegram bot" /><br><em>Telegram bot</em> |

## ✨ Features

**Training**
- A workout screen made for the phone at the gym: rest timer (the alert arrives with the screen locked too), screen always on, exercise videos.
- **Load suggestion**: from your last sessions the app suggests today's weight and says why (double progression, with a deload after three sessions in a row below the rep range). [More](docs/features/last-time-and-load-suggestion.md)
- **Warm-up and drop sets**: the warm-up ramp to today's weight, one tap per step; drops are added to the set. Warm-ups stay out of volume, set counts and records.
- **Offline**: sets and the end of the workout stay on the phone and leave on their own when the network comes back, once, with the right time. [More](docs/offline-and-sessions.md)
- "Last time" for every set, plates per side, exercises added on the fly.
- Resume a workout closed by mistake, fix a finished one, log one done without the app, save one as a plan. Workouts left open close themselves at their last set. [More](docs/features/workout-history.md)

**Plans and schedule**
- Personal and shared plans, with technique notes per exercise; clone them or download them as Word (.docx).
- A calendar of planned workouts, shown on top of the start page, with a reminder when you open the app and notifications.
- A catalogue of more than 3,200 exercises with English and Italian names, typo-tolerant search and favourites. [More](docs/exercise-catalogue.md)

**Progress**
- Statistics: muscles trained and recovering, the trend of each exercise, estimated maxes, personal records, the year's activity, weekly frequency.
- Body composition over time (weight, fat, muscle, water, BMR…), entered by you or your trainer.
- Gamification: XP, levels, badges and leaderboards (can be turned off).

**The gym**
- **Personal trainers**: clients and requests, appointments, assigned plans, announcements, measurements.
- **Real-time chat** between members and with your trainer. [More](docs/features/chat.md)
- **Crowd levels**: how full the gym is now and the best times to go (Google Maps data).
- **Telegram bot**: plans, statistics, guided plan creation and message notifications.
- **AI assistant** (Google Gemini) that knows your workouts. [More](docs/features/ai-assistant.md)

**Account and privacy**
- Sign in with a password or a **passkey** (fingerprint, face, PIN), and a list of linked devices. [More](docs/features/authentication.md)
- Email verification and password recovery (with [Resend](https://resend.com)).
- Export all your data or delete your account; privacy policy, terms and cookies. [More](docs/features/profile.md)
- Admin panel: users, gyms, exercises, members' suggestions, news and banners.

## 🧱 How it is built

```text
phone / PC ──▶ nginx :6969 ──┬──▶ frontend/dist (React PWA)
                             └──▶ /api, /socket.io ──▶ backend :3000 ──┬──▶ PostgreSQL 17
                                                                       └──▶ Redis 7
Telegram ──▶ bot ──▶ backend
scraper (crowd levels, every 30 min) ──▶ PostgreSQL
```

Every service runs in Docker Compose.

| Part | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Framer Motion, Recharts; PWA with Web Push |
| Backend | Node.js 22, Express 4, Prisma 6, Socket.io 4 |
| Data | PostgreSQL 17, Redis 7 |
| Security | Argon2id, passkeys (WebAuthn), JWT with rotating refresh tokens, Helmet, rate limits |
| Bot | grammY (Telegram) |
| Scraper | Playwright |
| Infrastructure | Docker Compose, Nginx |

### Repository layout

```text
webapp-palestra/
├── frontend/         React app (pages, components, hooks, utils with their tests)
├── backend/          Express + Socket.io API, tests (node:test)
│   └── prisma/       Schema, migrations, seed, exercise catalogue and "what's new" stories
├── bot/              Telegram bot: forwards to the backend
├── scraper/          Gym crowd levels from Google Maps
├── nginx/            Serves the frontend and passes /api and /socket.io to the backend
├── deploy/           Automatic releases on the server, with their tests
├── docs/             Feature docs, screenshots, project site
├── .github/          CI (tests, production images) and templates
├── docker-compose.yml
├── version.json      App version and user-facing changelog
└── .env.example      Every environment variable, with comments
```

Code names (variables, files, API routes, database tables) are in Italian, the language the project started in. Comments and docs are in English.

## 🚀 Installation

You need [Docker](https://docs.docker.com/get-docker/) with Compose, and Node.js 22 to build the frontend.

```bash
git clone https://github.com/giosci1994/webapp-palestra.git
cd webapp-palestra

# 1. Environment: change at least the passwords, the JWT secrets, APP_URL and ORIGINI_CONSENTITE
cp .env.example .env

# 2. The frontend: nginx serves the frontend/dist folder
(cd frontend && npm ci && npm run build)

# 3. Database, backend and nginx
docker compose up -d --build db redis backend nginx
```

At the first start the backend applies the migrations and fills the database: the administrator (`SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` from `.env`), the equipment, the exercise catalogue, a few gyms and the sample plans. The app answers on **http://localhost:6969**.

The bot and the scraper are optional. The bot needs `TELEGRAM_BOT_TOKEN` and `BOT_SECRET`. The scraper reads the crowd levels of the gyms that have a Google Place ID; `scraper/trova-place-ids.js` looks them up once for the gyms that have none. When they are configured:

```bash
docker compose up -d --build bot scraper
docker compose run --rm --entrypoint node scraper trova-place-ids.js   # once, for the Place IDs
```

To use it away from home you need HTTPS on a domain, for example with a Cloudflare tunnel or a reverse proxy in front of nginx. Passkeys only work on the domain of `APP_URL`.

These features stay off until you set their key in `.env`: AI assistant (`GEMINI_API_KEY`), email (`RESEND_API_KEY`), push notifications (`VAPID_CHIAVE_PUBBLICA` and `VAPID_CHIAVE_PRIVATA`). Every variable is explained in [`.env.example`](.env.example).

## 💻 Development

Postgres and Redis in Docker, backend and frontend on your computer with live reload:

```bash
docker run -d --name gymmaster-dev-db -p 5432:5432 \
  -e POSTGRES_USER=gymmaster -e POSTGRES_PASSWORD=gymmaster -e POSTGRES_DB=gymmaster postgres:17-alpine
docker run -d --name gymmaster-dev-redis -p 6379:6379 redis:7-alpine

# Backend: a backend/.env with DATABASE_URL=postgresql://gymmaster:gymmaster@localhost:5432/gymmaster,
# REDIS_URL=redis://localhost:6379, the two JWT secrets and ORIGINI_CONSENTITE=http://localhost:5173
cd backend && npm ci
npx prisma migrate deploy && npx prisma db seed
npm run dev                     # http://localhost:3000

# Frontend, in another terminal
cd frontend && npm ci && npm run dev   # http://localhost:5173, /api goes to the backend
```

A change to `backend/prisma/schema.prisma` comes with its migration (`npx prisma migrate dev --name ...`). The project rules are in [`CLAUDE.md`](CLAUDE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🧪 Tests

```bash
# Backend: unit and integration tests. They need Docker: they start a throwaway
# Postgres and Redis and never touch the real database
cd backend && npm test
cd backend && npm run test:unitari      # unit tests only, no Docker

# Frontend: tests (Vitest) and ESLint, at zero errors and zero warnings
cd frontend && npm test && npm run lint

# The release script, with fake docker, curl and npm
bash deploy/test/rilascio.test.sh
```

Every pull request runs them on GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)), together with the production image builds and a backend start on an empty database.

## 📦 Releases

The app version is in [`version.json`](version.json), with the changes written for users. When a release comes out on GitHub (tag `v` + the version, from `master`), the server installs it on its own with [`deploy/rilascio.sh`](deploy/rilascio.sh): database copy, migrations, frontend, checks and a Telegram message; if something goes wrong it goes back to the previous version. All the details are in [`deploy/README.md`](deploy/README.md).

## 📚 Documentation

- [`docs/features/`](docs/features/): [authentication](docs/features/authentication.md), [chat](docs/features/chat.md), [AI assistant](docs/features/ai-assistant.md), [profile](docs/features/profile.md), [workout history](docs/features/workout-history.md), [last time and load suggestion](docs/features/last-time-and-load-suggestion.md)
- [`docs/offline-and-sessions.md`](docs/offline-and-sessions.md): staying signed in on the phone and training offline
- [`docs/exercise-catalogue.md`](docs/exercise-catalogue.md): where the exercise catalogue comes from and how to update it
- [`docs/translations.md`](docs/translations.md): how the app picks its language, and how to add one
- [`docs/ui-spacing.md`](docs/ui-spacing.md): spacing and safe-area rules of the interface
- [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma): the data model, with comments

## 🤝 Contributing

Issues and pull requests are welcome: read [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ☕ Support

If GymMaster is useful to you, you can buy me a coffee.

<a href="https://buymeacoffee.com/giosci1994u"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="45" alt="Buy Me a Coffee" /></a>

## 📄 License

Free software under the [GNU General Public License v3.0](LICENSE).
