# Exercise catalogue

## Overview

The catalogue comes from the **Functional Fitness Exercise Database v2.9**, a spreadsheet with 3,242 exercises. A Python script turns it into JSON, and the seed (new installations) or the import script (existing ones) loads it into the database.

Names in the source are English. Each exercise also gets an Italian name (`nomeIt`), which the app shows to Italian users; search looks at both.

## Files

| File | What it is |
|------|------------|
| `backend/prisma/dati/converti_excel.py` | Spreadsheet → JSON |
| `backend/prisma/dati/esercizi.json` | The 3,242 exercises (generated) |
| `backend/prisma/dati/attrezzature.json` | 59 pieces of equipment: the 31 of the spreadsheet plus the app's own |
| `backend/prisma/dati/attrezzature_importate.json` | Only the spreadsheet's equipment |
| `backend/prisma/seed.js` | Fills an empty database, catalogue included |
| `backend/prisma/import-esercizi.js` | Adds and updates the catalogue in an existing database |
| `backend/src/utils/catalogoEsercizi.js` | One catalogue entry as database data, shared by the seed and the import |
| `backend/src/utils/traduzioneEsercizi.js` | The English → Italian dictionary for the names |
| `backend/src/utils/macchineCardio.js` | The six cardio machines (treadmill, exercise bike…) every installation has, English and Italian names, and the words the Telegram bot recognises them by |

## Exercise fields

From the spreadsheet:
- `nome`: the name (English);
- `gruppoMuscoloPrimario`, `gruppoMuscoloSecondario`: muscle groups, stored in Italian (table below);
- `attrezzatura`: the equipment, in Italian;
- `linkVideo`: YouTube link (from the spreadsheet's hyperlinks, 2,149 exercises have one);
- `descrizione`;
- `difficulty`: from Principiante (beginner) to Leggendario (legendary), 8 levels;
- `bodyRegion`: core, upper body, lower body, full body;
- `mechanics`: compound or isolation;
- `posture`, `movementPattern`, `laterality`, `forceType`, `classification`: as in the source (Standing, Horizontal Push, Unilateral, Push, Bodybuilding…).

Added by the app:
- `nomeIt`: the Italian name, built from the dictionary.

## Italian names

There are only about 480 distinct words in the 3,300 names, so the translation is a dictionary, not natural language: same name in, same name out, and fixing one dictionary entry fixes every name that uses it. Each word has a role (movement, body part, variant, position, equipment), so the Italian name follows Italian word order: "Double Dumbbell Romanian Deadlift" → "Stacco Rumeno con Due Manubri". Many gym words stay English in Italian too (squat, plank, curl, hip thrust).

The seed fills `nomeIt` for every exercise. The import only fills it where it is empty, so names fixed by hand in the admin page stay.

The cardio machines are not in the spreadsheet: the seed creates the missing ones at every start, with `nome` in English and `nomeIt` in Italian ("Treadmill" / "Tapis Roulant").

## Muscle groups

| English | Stored as |
|---------|-----------|
| Quadriceps | Quadricipiti |
| Shoulders | Spalle |
| Abdominals | Addominali |
| Back | Schiena |
| Glutes | Glutei |
| Chest | Petto |
| Biceps | Bicipiti |
| Triceps | Tricipiti |
| Hip Flexors | Flessori dell'Anca |
| Calves | Polpacci |
| Hamstrings | Femorali |
| Forearms | Avambracci |
| Abductors | Abduttori |
| Adductors | Adduttori |
| Trapezius | Trapezio |
| Shins | Tibiali |

## Updating the catalogue

When a new version of the spreadsheet comes out:

```bash
cd backend/prisma/dati
pip install openpyxl
python converti_excel.py <path to the .xlsx file>   # rewrites esercizi.json and attrezzature_importate.json

cd ../..
node prisma/import-esercizi.js
```

The import can run many times without creating duplicates: it adds the missing equipment and exercises, updates the existing exercises and links equipment to gyms. On a new installation the seed does all of this at the first start.
