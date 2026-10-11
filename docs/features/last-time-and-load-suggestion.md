# Last time, load suggestion, warm-up and drop sets

## Overview

During a workout (`frontend/src/pagine/WorkoutLive.jsx`), above the weight and reps fields, the app helps choose the load of the next set:

- **Suggestion**: the weight and reps to aim for today, with the reason.
- **Last time**: the same set the last time the exercise was done, in any plan.
- **Warm-up ramp**: before the first work set, the steps up to today's weight.

Each one has a **"Usa"** (Use) button that fills in the fields.

## Backend API

### `GET /api/v1/sessioni/ultimi-carichi?esercizi=1,2,3&escludi=<id>`

The last sessions of each exercise, in any plan: a new plan has no previous session of its own, but the exercise may have been done elsewhere. `escludi` is the workout in progress. Only completed work sets count: warm-ups and drops are left out.

```json
{
  "successo": true,
  "dati": {
    "1": {
      "sessioneId": 42,
      "data": "2026-10-08T17:00:00.000Z",
      "serie": [
        { "serieNumero": 1, "pesoEffettivo": 80, "repEffettive": 10, "rpe": 7 },
        { "serieNumero": 2, "pesoEffettivo": 80, "repEffettive": 9, "rpe": 8 }
      ],
      "storico": [
        { "sessioneId": 42, "data": "2026-10-08T17:00:00.000Z", "serie": [ "..." ] },
        { "sessioneId": 37, "data": "2026-10-04T16:30:00.000Z", "serie": [ "..." ] }
      ]
    }
  }
}
```

`serie` is the last time; `storico` holds up to the last 4 times, for the suggestion.

## Load suggestion

`frontend/src/utils/progressione.js`, **double progression**: work within a rep range ("8-12").

- All sets at the top of the range: the weight goes up one step and the reps start again from the bottom.
- Otherwise, same weight, aiming for one more rep.
- Three times in a row at the same weight without even reaching the bottom of the range: the weight drops by 10% (deload) and climbs again.

The step depends on the equipment (`incrementoPer`): 2.5 kg for a barbell (two 1.25 kg plates), 2 kg for dumbbells, 4 kg for kettlebells, 5 kg for machines and cables. There is no suggestion the first time, for bodyweight exercises, or when the plan's reps are not a number or a range.

## Last time

The set with the same number as the current one (set 2 → set 2 of last time), or the last set when last time had fewer. For cardio it shows minutes and level.

## Warm-up and drop sets

`frontend/src/utils/tipiSerie.js`, with the same rules as the server (`backend/src/utils/tipiSerie.js`).

- **Warm-up ramp**: 40% × 10, 60% × 5, 80% × 3 of the work weight, rounded to the equipment's step, never below the empty bar, without repeated steps. Tapping a step logs it as a warm-up set. Warm-ups are shown but left out of volume, set counts, records and progression.
- **Drop set**: added to a work set before logging it, proposed one fifth lighter (at least one step less). It counts in the volume, not as a set of its own.
