# Profile

## Overview

The Profile page (`frontend/src/pagine/Profilo.jsx`) holds the user's data and settings, in tabs:

| Tab | What it holds |
|-----|---------------|
| Profilo | Photo, name, birth date, weight, height, gender, bio, fitness goal, gym, request to become a trainer |
| Notifiche | Push notifications on this device and which ones to get |
| Privacy | What other members can see, gamification on/off, how long the chat messages you send are kept, data export |
| Personal Trainer | Your trainer, or finding and joining one |
| Sicurezza | Password, passkeys, linked devices |
| Fatturazione | Placeholder: not built yet |
| Legal & Compliance | Terms, privacy and cookie policies, app info |
| Elimina Account | Deletes the account and its data |

## Backend API (`/api/v1/utenti`)

### `PATCH /profilo`

Updates the profile. Allowed fields:

| Field | Type | Description |
|-------|------|-------------|
| `nome` | string | Display name |
| `immagineProfilo` | string | Base64 JPEG (up to about 300 KB) |
| `dataNascita` | date | Birth date |
| `pesoKg` | float | Weight in kg |
| `altezzaCm` | int | Height in cm |
| `genere` | string | "M", "F", "Altro" |
| `bio` | string | Up to 200 characters |
| `obiettivoFitness` | string | "Massa Muscolare", "Definizione", … |
| `preferenzeVisibilita` | string (JSON) | `{"palestra":true,"peso":false,...}` |
| `gamificationAttiva` | boolean | XP, levels and badges on or off |
| `palestraId` | int \| null | The user's gym |

### Other endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profilo` | The signed-in user |
| POST | `/cambia-password` | `{ "vecchiaPassword": "...", "nuovaPassword": "..." }` |
| GET | `/info-app` | Version, stack and changelog from `version.json` |
| GET | `/esportazione` | Every piece of the user's data, as a JSON file |
| DELETE | `/account` | Deletes the account |

## Frontend

- **Photo**: cropped to a square (`componenti/comuni/RitaglioFoto.jsx`), redrawn at 400×400 and saved as JPEG at 85% quality.
- **Visibility switches**: saved as soon as they are tapped.
- **App info**: a drawer with the app and server versions, the stack and the changelog.

## Versions

`version.json`, at the root of the repository, is the app's version: number, build date, user-facing changelog and stack. The backend reads it at startup, and Vite publishes it as `/version.json` at every build. Clients download it every 2 minutes and update themselves when it changes. How a version reaches the server is in [`deploy/README.md`](../../deploy/README.md).
