# Profilo Utente Esteso

## Descrizione
Pagina profilo potenziata con gestione avatar, dati personali, privacy, cambio password e info app.

## API Backend

### `PATCH /api/v1/utenti/profilo`
Aggiorna i dati del profilo. Campi consentiti:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `nome` | string | Nome visualizzato |
| `immagineProfilo` | string | Base64 JPEG (max ~300KB) |
| `dataNascita` | date | Data di nascita |
| `pesoKg` | float | Peso in kg |
| `altezzaCm` | int | Altezza in cm |
| `genere` | string | "M", "F", "Altro" |
| `bio` | string | Max 200 caratteri |
| `obiettivoFitness` | string | "Massa Muscolare", "Definizione", ecc. |
| `preferenzeVisibilita` | string (JSON) | `{"palestra":true,"peso":false,...}` |

### `POST /api/v1/utenti/cambia-password`
```json
{ "vecchiaPassword": "xxx", "nuovaPassword": "yyy" }
```

### `GET /api/v1/utenti/info-app`
Restituisce versione, stack, changelog da `version.json`.

## Versioning
- **`version.json`** nella root del progetto: versione, data build, changelog, stack
- **`build.js`** script: `node build.js [patch|minor|major]` auto-incrementa versione e builda il frontend
- Ad ogni deploy: `node build.js` → `docker compose up -d --build backend && docker compose restart nginx`

## Frontend
- **Avatar**: ridimensionato a 200×200 con Canvas, compresso JPEG 0.7
- **Toggle visibilità**: auto-save immediato al click
- **Info App**: drawer con stack tecnologico e changelog scrollabile
