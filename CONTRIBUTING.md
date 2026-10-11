# Contributing to Web-App Palestra

*Read this in other languages: [Italiano](#italiano)*

Thank you for your interest in contributing! This project is free software, released under the **GNU General Public License v3.0** (see [LICENSE](LICENSE)). Issues and Pull Requests are welcome.

## Reporting Bugs
- Check existing issues before opening a new one.
- Use the Bug Report template to provide as much detail as possible.

## Pull Requests
- Run the tests before opening one: `cd backend && npm test` (needs Docker) and `cd frontend && npm test && npm run lint`. GitHub Actions runs them on every Pull Request; ESLint errors and warnings both block it.
- If you change a piece of logic (records, volume, dates, permissions, authentication), add or update its test.
- If your change is visible to users, update `version.json` (version and a changelog entry written for users).
- Every change to `backend/prisma/schema.prisma` needs its migration (`npx prisma migrate dev --name ...`): the tests check that the migrations build exactly the schema.
- By contributing you agree that your contribution is released under the GPLv3, like the rest of the project.

---

<a id="italiano"></a>
# Contribuire a Web-App Palestra

Grazie per l'interesse! Questo progetto è software libero, distribuito sotto licenza **GNU General Public License v3.0** (vedi [LICENSE](LICENSE)). Issue e Pull Request sono benvenute.

## Segnalare Bug
- Controlla le issue esistenti prima di aprirne una nuova.
- Usa il template "Bug Report" per fornire più dettagli possibili.

## Pull Request
- Prima di aprirne una, esegui i test: `cd backend && npm test` (serve Docker) e `cd frontend && npm test && npm run lint`. GitHub Actions li esegue su ogni Pull Request: errori e avvisi di ESLint la bloccano.
- Se cambi una logica (record, volume, date, permessi, autenticazione), aggiungi o aggiorna il suo test.
- Se la modifica si vede nell'app, aggiorna `version.json` (versione e una voce del changelog scritta per gli utenti).
- Ogni modifica a `backend/prisma/schema.prisma` va con la sua migrazione (`npx prisma migrate dev --name ...`): i test controllano che le migrazioni producano esattamente lo schema.
- Contribuendo accetti che il tuo contributo sia distribuito sotto GPLv3, come il resto del progetto.
