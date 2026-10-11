# Rilasci

Il server di produzione si aggiorna da solo quando su GitHub esce una release
nuova. Lo fa `deploy/rilascio.sh`, che cron lancia ogni 2 minuti: il server
non deve essere raggiungibile da fuori e GitHub non ha nessun accesso al
server, perché è il server che va a guardare.

## Pubblicare una versione

1. La pull request porta `version.json` alla versione nuova (vedi CLAUDE.md)
   e, se ci sono, le storie in `backend/prisma/novita.json`.
2. Merge su `master`.
3. Su GitHub: **Releases → Draft a new release**. Il tag è `v` più la versione
   di `version.json` (per esempio `v1.2.1`), il ramo è `master`. Come testo
   vanno bene le voci del changelog. **Publish release**.

Entro un paio di minuti arriva su Telegram `✅ GymMaster 1.2.1 installata`,
oppure cosa non è andato.

## Cosa fa lo script

Installa una release solo se è più nuova di quella installata: non torna mai
indietro da solo. Prima di cambiare qualcosa controlla che:

- nella cartella di produzione non ci siano modifiche fatte a mano;
- il tag sia su `master`, quindi codice già unito;
- `version.json` del tag dica la stessa versione del tag.

Poi:

1. fa una copia del database in `~/backup/gymmaster/` (tiene le ultime 10);
2. prepara senza toccare il sito: immagine del backend, bot e scraper solo se
   sono cambiati, build del frontend in una cartella a parte, prova della
   configurazione di nginx se è cambiata;
3. passa alla versione nuova: ricrea il backend, che applica le migrazioni,
   ed eventualmente bot, scraper e nginx; pubblica il frontend;
4. controlla che sito e server rispondano con la versione nuova;
5. aggiunge le storie della versione (`backend/prisma/novita.json`).

Se la preparazione fallisce, il sito non è stato toccato. Se fallisce il
passaggio, torna alla versione di prima. Le migrazioni del database però non
si annullano: per quelle c'è la copia fatta al punto 1. Una release fallita non
si riprova da sola.

## Comandi sul server

Dalla cartella di produzione:

```bash
deploy/rilascio.sh --controlla        # cosa farebbe adesso
deploy/rilascio.sh --installa v1.2.1  # installa (o riprova) quella release
deploy/rilascio.sh --prova-telegram   # messaggio di prova
```

Log: `~/.local/state/gymmaster-rilascio/rilascio.log`.

## Installazione sul server (una volta)

La cartella di produzione è un clone a parte, dove nessuno lavora:

```bash
git clone https://github.com/giosci1994/webapp-palestra.git ~/gymmaster
cp <vecchia cartella>/.env ~/gymmaster/.env   # e chmod 600
```

Nel `.env` servono `TELEGRAM_BOT_TOKEN` e `RILASCI_TELEGRAM_CHAT_ID` (vedi
`.env.esempio`). Poi, con `crontab -e`:

```
*/2 * * * * /home/pi/gymmaster/deploy/rilascio.sh
```

Il compose ha il nome di progetto fissato (`web-apppalestra`): avviato dalla
cartella nuova riprende gli stessi container e lo stesso volume del database.
Per lo stesso motivo `docker compose` (quello di produzione) non va mai
lanciato da un'altra copia del repository: prenderebbe in mano la produzione.

## Prove

`bash deploy/test/rilascio.test.sh` prova lo script su un repository di prova,
con docker, curl e npm finti: non tocca niente di vero. Le fa anche la CI.
