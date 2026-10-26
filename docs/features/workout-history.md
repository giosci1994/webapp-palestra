# Workout history

## Overview

The page with every past workout of the user: weight, reps, RPE and the other details of each set of each exercise. A wrong workout can be fixed from here, for example one left open all night.

## Backend API

### `GET /api/v1/sessioni/storico`

The finished workouts, with their sets grouped by exercise.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pagina` | int | 1 | Page number |
| `limite` | int | 15 | Workouts per page |
| `schedaId` | int | — | Only the workouts of this plan |

**Response:**

```json
{
  "successo": true,
  "dati": [
    {
      "id": 1,
      "dataInizio": "2026-05-01T10:00:00Z",
      "dataFine": "2026-05-01T11:15:00Z",
      "durataMinuti": 75,
      "minutiRiscaldamento": 10,
      "volumeTotaleKg": 4500,
      "noteFinali": "Good session",
      "scheda": {
        "id": 3,
        "titolo": "Push Day",
        "numEsercizi": 5
      },
      "serieCompletate": 15,
      "esercizi": [
        {
          "esercizio": { "id": 1, "nome": "Bench Press", "gruppoMuscoloPrimario": "Petto" },
          "serie": [
            { "id": 100, "serieNumero": 1, "tipo": "RISCALDAMENTO", "pesoEffettivo": 40, "repEffettive": 10, "rpe": null },
            { "id": 101, "serieNumero": 1, "tipo": "LAVORO", "pesoEffettivo": 80, "repEffettive": 10, "rpe": 7 },
            { "id": 103, "serieNumero": 1, "tipo": "DROP", "pesoEffettivo": 60, "repEffettive": 8, "rpe": null },
            { "id": 102, "serieNumero": 2, "tipo": "LAVORO", "pesoEffettivo": 85, "repEffettive": 8, "rpe": 8 }
          ]
        }
      ]
    }
  ],
  "paginazione": {
    "totale": 42,
    "pagina": 1,
    "limite": 15,
    "pagine": 3
  }
}
```

### `PATCH /api/v1/sessioni/:id`

Fixes a **finished** workout (one in progress gets a 400). Only its owner or a SUPERADMIN. Only the fields in the body change, all in one transaction: an error leaves nothing half done.

| Field | Type | Description |
|-------|------|-------------|
| `dataInizio` | ISO string | New start (not in the future, not more than 2 years ago) |
| `durataMinuti` | int | 1 to 600. The end is start + duration and cannot fall in the future |
| `minutiRiscaldamento` | int \| null | `null` clears it |
| `noteFinali` | string \| null | Empty → `null` |
| `serie` | array | The **full** list of the sets done after the change, in the order to show them |

Each item of `serie` is `{ id, ...values }` for an existing set, or `{ esercizioId, ...values }` for a new one, added to an exercise already in the workout. Done sets missing from the list are deleted; skipped ones (`completato: false`) are not in the history and stay as they are. Values: `pesoEffettivo`, `repEffettive`, `rpe` (1-10), `durataMinuti`, `livelloResistenza`, `tipo` (`LAVORO`, `RISCALDAMENTO`, `DROP`); a missing field stays as it is.

**Set types** (`backend/src/utils/tipiSerie.js`). Warm-up sets are shown but left out of volume, set counts, records, estimated maxes and load progression. A drop set counts in the volume but not as a set of its own. Work sets are numbered 1, 2, 3…, warm-ups have their own numbering, and a drop takes the number of the work set before it. The history shows them in this order: warm-up, then each set followed by its drops. When editing, tapping the number of a set changes its type.

After the sets change:
- each exercise's sets are numbered again, per type, as above;
- the volume (`volumeTotaleKg`) is computed again;
- personal records are realigned: a record born from a weight the workout held and no set reaches any more disappears (800 kg typed instead of 80), and if the real maximum is left without a record, one is created, dated to the workout where it was lifted.

If the day changes, the planned workout this session closed is open again, and the one of the new day (same plan) is closed.

**Response:** `{ successo, dati, recordPersonali }`: `dati` is the workout in the `/storico` format, `recordPersonali` the records created.

## Frontend

### `StoricoAllenamenti.jsx`

- **Route:** `/storico`
- **File:** `frontend/src/pagine/StoricoAllenamenti.jsx`

### Features

1. **Workout cards**: date, plan, duration, volume, exercises.
2. **Detail drawer**: tapping a workout opens a bottom sheet with:
   - KPIs (duration, volume, total sets);
   - final notes;
   - each exercise with its sets (weight, reps, RPE);
   - cardio exercises (duration, level).
3. **Filter by plan**.
4. **Pagination**.
5. **Delete** a workout: with the bin on its card, always in sight (shown only on hover, it never appeared on a phone), or with the button at the bottom of the drawer; both ask for a confirmation.
6. **Edit** (`ModificaAllenamento.jsx`, from the drawer's "✏️ Modifica" button):
   - day, start time, end time and duration: end time and duration are linked, fill in the one you remember (an end before the start falls on the next day);
   - warm-up and notes;
   - sets: fix weight, reps and RPE (minutes and level for cardio), delete them or add some to an exercise already in the workout;
   - only what changed is sent; closing with unsaved changes asks for a confirmation.
7. **Suspicious duration**: over 4 hours (`DURATA_SOSPETTA_MINUTI`) the duration is highlighted in the list and in the drawer, with a "Correggi" button that opens the editor. It is the sign of a workout left open and closed with "Termina" hours later.

### Navigation

- **Desktop sidebar**: "Storico".
- **Dashboard**: the "Storico Allenamenti" shortcut and the "Storico →" link next to recent activity.
