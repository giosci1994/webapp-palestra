# Releases

The production server updates itself when a new release comes out on GitHub. `deploy/rilascio.sh` does it, run by cron every 2 minutes. The server does not need to be reachable from outside and GitHub has no access to it: the server is the one that goes and looks.

## Publishing a version

1. The pull request bumps `version.json` to the new version (see CLAUDE.md) and, if there are any, adds the stories to `backend/prisma/novita.json`.
2. Merge into `master`. More pull requests can go into the same version: they add their lines to its changelog entry.
3. When the version is ready: on GitHub, **Actions → Rilascia → Run workflow** (branch `master`). It creates the tag `v` + the version and the release on the tip of `master`, with the changelog entry as notes, after checking that the version is new, has its changelog entry and that the tests of that commit finished green (`deploy/pubblica-release.sh`). Tick **Solo prova** to run the checks without publishing.

   By hand it still works: **Releases → Draft a new release**, tag `v` + the version in `version.json`, target `master`, published after the version commit is on `master`.

Within a couple of minutes Telegram says `✅ GymMaster 1.2.1 installata` (installed), or what went wrong.

## What the script does

It installs a release only if it is newer than the installed one: it never goes back on its own. Before changing anything it checks that:

- the production folder has no changes made by hand;
- the tag is on `master`, so the code was merged;
- `version.json` in the tag has the same version as the tag.

Then it:

1. copies the database to `~/backup/gymmaster/` (keeping the last 10);
2. prepares without touching the site: backend image, bot and scraper only if they changed, frontend build in a separate folder, nginx configuration test if it changed;
3. switches to the new version: recreates the backend, which applies the migrations, and bot, scraper and nginx if needed; publishes the frontend;
4. checks that site and server answer with the new version;
5. adds the version's stories (`backend/prisma/novita.json`).

If the preparation fails, the site was not touched. If the switch fails, it goes back to the previous version. Database migrations are not undone, though: that is what the copy of step 1 is for. A failed release is not retried on its own.

## Commands on the server

From the production folder:

```bash
deploy/rilascio.sh --controlla        # what it would do now
deploy/rilascio.sh --installa v1.2.1  # install (or retry) that release
deploy/rilascio.sh --prova-telegram   # test message
```

Log: `~/.local/state/gymmaster-rilascio/rilascio.log`.

## Installing on the server (once)

The production folder is a separate clone, where nobody works:

```bash
git clone https://github.com/giosci1994/webapp-palestra.git ~/gymmaster
cp <old folder>/.env ~/gymmaster/.env   # and chmod 600
```

The `.env` needs `TELEGRAM_BOT_TOKEN` and `RILASCI_TELEGRAM_CHAT_ID` (see `.env.example`). Then, with `crontab -e` (cron wants the full path of your home):

```
*/2 * * * * /home/<user>/gymmaster/deploy/rilascio.sh
```

The compose project name is fixed (`web-apppalestra`): started from the new folder, it takes over the same containers and the same database volume. For the same reason, the production `docker compose` must never be run from another copy of the repository: it would take over production.

## Tests

`bash deploy/test/rilascio.test.sh` tests the script on a test repository, with fake docker, curl and npm: it touches nothing real. CI runs it too.
