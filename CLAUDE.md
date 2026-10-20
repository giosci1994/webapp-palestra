## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## How we work

- Always talk to Giovanni, the project owner, in Italian: replies, questions and summaries.
- Everything that goes into the repository is in English: README, docs, code comments, commit messages, pull requests, issue and PR comments. Code names stay in Italian (variables, functions, files, routes, database tables and columns): keep new ones consistent with the code around them. When you touch a file with Italian comments, translate the comments you change.
- The app is for users all over the world: English is its base language, Italian a translation, and more can follow (`docs/translations.md`). Every text users see goes through `frontend/src/i18n`: `t('<namespace>.<key>')` with the text in `testi/en` and `testi/it`, the same keys in both, never hard-coded. Dates and numbers through `utils/formattatori.js` or `localeCorrente()`. The server's texts (errors, confirmations, notifications, emails, the bot) go through `backend/src/i18n` the same way, in the request's language; a text for another user (notification, push, Telegram) in the recipient's (`creaNotifica` and `inviaPush` take keys). The tests check the keys on both sides.
- Days, weeks and hours are each user's, in their time zone: on the server through `backend/src/utils/date.js` (`giornoLocale`, `chiaveGiorno`, `orarioLocale`, `inizioGiorno`, `giorniDiFila`), never `toISOString().split('T')[0]` or `setHours`. During a request the time zone is the one the phone sends (`X-Fuso-Orario`, kept like the language); outside a request (timers, notifications for another user) pass the recipient's (`fusoDi(utente)`, `fusoDiUtenteId`). The gym's crowd levels stay in the gym's time zone (`FUSO_ORARIO`).
- One commit per feature. When the work is done and the tests are green, push and open the pull request without asking. Pull requests target `master`, never another branch: GitHub does not move the base when the PR below is merged.
- Giovanni merges, after looking at the PR's tests. Production updates when he publishes a release on GitHub (see "Releases"): nothing is installed from a work session.
- The repository is public: no secrets, keys, user data or internal addresses in commits, PRs and files.

## Tests

- Backend: `cd backend && npm test` runs the unit and integration tests. It needs Docker: it starts a throwaway Postgres and Redis (`backend/test/docker-compose.yml`) and never touches the real database. Without Docker: `npm run test:unitari` (CI runs the others on the PR anyway).
- Frontend: `cd frontend && npm test` (Vitest) and `npm run lint`: ESLint is at zero errors and zero warnings, and CI blocks both (`--max-warnings 0`). To load data in an effect: `api.get(...).then(...)` with the state updated in the callbacks, and "loading" derived from what has been loaded (see Statistiche, Storico).
- Releases: `bash deploy/test/rilascio.test.sh` tests `deploy/rilascio.sh` with fake docker, curl and npm. Whoever changes the script updates its tests too.
- Whoever changes a piece of logic (records, volume, dates, permissions, authentication) adds or updates its test: in the backend in `backend/test/` with `node:test`, in the frontend next to the file (`*.test.js`). Pull requests run them on GitHub Actions (`.github/workflows/test.yml`).

## Database

- Every change to `backend/prisma/schema.prisma` comes with its migration (`npx prisma migrate dev --name ...`), never `db push`: the tests apply the migrations to an empty database and fail if the result differs from the schema.
- The folder of a new migration must sort, alphabetically, after the last existing one: some start with a future date (`20261014_...`), so the folder created by `migrate dev` must be renamed if it sorts earlier.
- Never `prisma format`: it rewrites the whole schema. The Prisma configuration is in `backend/prisma.config.js`.

## Version and what's new

- `version.json` at the root is the app's version: Profile → Info Applicazione shows it (app and server), the backend reads it at startup and Vite publishes it as `/version.json` at every build. Clients download it every 2 minutes and update themselves when it changes.
- A pull request with something new for users updates `version.json`: `versione` (minor for new features, patch for fixes), `build` with the date and an entry in `changelog` written for users, in Italian (`modifiche`, used by the Telegram release message) and in English (`modificheEn`, for the release notes). If the technology changes, `stack` too.
- The "what's new" stories (the app's story popup) live in `backend/prisma/novita.json`, each with the `versione` that brings it: when that version is released they enter the app, once. Fields: `titolo` (unique), `sottotitolo`, `icona` (emoji), `punti` (`[{ icona, testo }]`), `ctaTesto` and `ctaRotta` (an app route), `coloreInizio` and `coloreFine` (`#rrggbb`), in Italian, and `en` with the English `titolo`, `sottotitolo`, `punti` and `ctaTesto`, shown to users in English. A test checks the file.

## Releases

- The GitHub release has tag `v` + the version in `version.json` (for example `v1.2.1`) and starts from `master`. On the server `deploy/rilascio.sh` installs it on its own within a couple of minutes: database copy, images, migrations, frontend, version check, stories, Telegram message; if something fails it goes back to the previous version. Details in `deploy/README.md`.
- Changes to the server's `.env`, fixes to the data in the database and Cloudflare settings cannot be made from the repository. If a change needs them, the PR says so clearly in an "On release" section.
- A new environment variable goes in `.env.example` with its comment, and the code must work without it (the feature stays off) until it is set.
