## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Come lavoriamo

- Rispondi sempre in italiano: l'utente e' Giovanni, il proprietario del progetto.
- Un commit per funzionalita'. Finito il lavoro, con i test verdi, fai push e apri la pull request senza chiedere conferma. Le PR hanno base `master`, mai un altro branch: GitHub non sposta la base quando la PR sotto viene unita.
- Il merge lo fa l'utente, dopo aver guardato i test della PR. La produzione si aggiorna quando l'utente pubblica una release su GitHub (vedi "Rilascio"): da una sessione di lavoro non si installa niente.
- Il repository e' pubblico: niente segreti, chiavi, dati degli utenti o indirizzi interni in commit, PR e file.

## Test

- Backend: `cd backend && npm test` esegue i test unitari e d'integrazione. Serve Docker: avvia un Postgres e un Redis usa-e-getta (`backend/test/docker-compose.yml`) e non tocca mai il database vero. Senza Docker: `npm run test:unitari` (gli altri li esegue comunque la CI sulla PR).
- Frontend: `cd frontend && npm test` (Vitest) e `npm run lint`: ESLint e' a zero errori e zero avvisi, e la CI blocca entrambi (`--max-warnings 0`). Per caricare i dati in un effetto: `api.get(...).then(...)` con lo stato aggiornato nelle callback, e "caricamento" ricavato da cosa e' stato caricato (vedi Statistiche, Storico).
- Rilascio: `bash deploy/test/rilascio.test.sh` prova `deploy/rilascio.sh` con docker, curl e npm finti. Chi cambia lo script aggiorna anche le prove.
- Chi cambia una logica (record, volume, date, permessi, autenticazione) aggiunge o aggiorna il suo test: nel backend in `backend/test/` con `node:test`, nel frontend accanto al file (`*.test.js`). Le pull request li eseguono su GitHub Actions (`.github/workflows/test.yml`).

## Database

- Ogni modifica a `backend/prisma/schema.prisma` va con la sua migrazione (`npx prisma migrate dev --name ...`), mai `db push`: i test applicano le migrazioni a un database vuoto e falliscono se il risultato non coincide con lo schema.
- Il nome della cartella di una migrazione nuova deve venire, in ordine alfabetico, dopo l'ultima esistente: alcune iniziano con una data futura (`20261014_...`), quindi la cartella creata da `migrate dev` va rinominata se finisce prima.
- Mai `prisma format`: riscrive l'intero schema. La configurazione di Prisma e' in `backend/prisma.config.js`.

## Versione e novita'

- `version.json` in radice e' la versione dell'app: la mostra Profilo → Info Applicazione (app e server), la legge il backend all'avvio e Vite la pubblica come `/version.json` a ogni build. I client la scaricano ogni 2 minuti e, se cambia, si aggiornano da soli.
- Una pull request con novita' per gli utenti aggiorna `version.json`: `versione` (minor per funzioni nuove, patch per correzioni), `build` con la data e una voce in `changelog` scritta per gli utenti. Se cambia la tecnologia usata, anche `stack`.
- Le storie delle novita' (il popup a storie dell'app) stanno in `backend/prisma/novita.json`, ognuna con la `versione` che la porta: al rilascio di quella versione entrano nell'app, una volta sola. Campi: `titolo` (unico), `sottotitolo`, `icona` (emoji), `punti` (`[{ icona, testo }]`), `ctaTesto` e `ctaRotta` (un percorso dell'app), `coloreInizio` e `coloreFine` (`#rrggbb`). Un test controlla il file.

## Rilascio

- La release su GitHub ha tag `v` + la versione di `version.json` (per esempio `v1.2.1`) e parte da `master`. Sul server `deploy/rilascio.sh` la installa da solo entro un paio di minuti: copia del database, immagini, migrazioni, frontend, controllo della versione, storie, messaggio su Telegram; se qualcosa fallisce torna alla versione di prima. Dettagli in `deploy/README.md`.
- Dal repository non si possono fare le modifiche al `.env` del server, le correzioni ai dati nel database e le impostazioni di Cloudflare. Se una modifica ne ha bisogno, la PR lo scrive chiaramente in una sezione "Al rilascio".
- Una variabile d'ambiente nuova va in `.env.esempio` con il suo commento, e il codice deve funzionare anche senza (la funzione resta spenta) finche' non viene impostata.
