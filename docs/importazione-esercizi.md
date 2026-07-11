# Documentazione: Importazione Database Esercizi

## Panoramica

Il modulo di importazione esercizi converte il database **"Functional Fitness Exercise Database v2.9"** (file Excel con 3.242 esercizi) nel formato compatibile con lo schema Prisma di GymMaster.

---

## File Coinvolti

### Script e Dati

| File | Descrizione |
|------|-------------|
| `prisma/dati/converti_excel.py` | Script Python per conversione Excel → JSON |
| `prisma/dati/esercizi.json` | 3.242 esercizi in formato JSON (generato dallo script) |
| `prisma/dati/attrezzature.json` | 59 attrezzature (36 originali + 23 nuove) |
| `prisma/dati/attrezzature_importate.json` | Solo le attrezzature dal database Excel (31) |
| `prisma/import-esercizi.js` | Script Node.js per importazione in produzione |
| `prisma/seed.js` | Seed aggiornato con supporto nuovi campi |

### Schema e Backend

| File | Modifica |
|------|----------|
| `prisma/schema.prisma` | +8 campi nel modello `Esercizio` |
| `src/routes/catalogo.routes.js` | +3 filtri (bodyRegion, difficulty, mechanics) |
| `src/routes/admin.routes.js` | CRUD esercizi con nuovi campi |

### Frontend

| File | Modifica |
|------|----------|
| `src/utils/costanti.js` | GRUPPI_MUSCOLARI da 11 a 21 gruppi |

---

## Struttura Dati Esercizio

### Campi Originali
- `nome` — Nome dell'esercizio (inglese, dal database)
- `gruppoMuscoloPrimario` — Gruppo muscolare principale (tradotto in italiano)
- `gruppoMuscoloSecondario` — Muscoli secondari (tradotti in italiano)
- `attrezzatura` — Nome attrezzatura richiesta (tradotta in italiano)
- `linkVideo` — URL YouTube (estratto dagli hyperlink Excel)
- `descrizione` — Descrizione testuale

### Nuovi Campi (v2.9)
- `difficulty` — Livello di difficoltà: Principiante, Novizio, Intermedio, Avanzato, Esperto, Master, Gran Master, Leggendario
- `bodyRegion` — Regione del corpo: Core, Parte Superiore, Parte Inferiore, Tutto il Corpo
- `mechanics` — Tipo di meccanica: Composto, Isolamento
- `posture` — Postura dell'esercizio: Supine, Prone, Standing, Seated, etc.
- `movementPattern` — Pattern di movimento: Anti-Extension, Hip Extension, Horizontal Push, etc.
- `laterality` — Lateralità: Bilateral, Unilateral, Contralateral
- `forceType` — Tipo di forza: Push, Pull, Other
- `classification` — Classificazione: Bodybuilding, Calisthenics, Postural, etc.

---

## Mapping Gruppi Muscolari (EN → IT)

| Inglese | Italiano |
|---------|----------|
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

---

## Statistiche Importazione

| Metrica | Valore |
|---------|--------|
| Esercizi totali | 3.242 |
| Con link video YouTube | 2.149 (66%) |
| Gruppi muscolari | 16 |
| Livelli di difficoltà | 8 |
| Attrezzature uniche | 31 (+23 nuove nell'app) |
| Body Regions | 4 |

### Distribuzione per Gruppo Muscolare

| Gruppo | Conteggio |
|--------|-----------|
| Quadricipiti | 1.319 |
| Spalle | 515 |
| Addominali | 432 |
| Schiena | 182 |
| Glutei | 181 |
| Petto | 171 |
| Bicipiti | 114 |
| Tricipiti | 90 |
| Flessori dell'Anca | 53 |
| Polpacci | 49 |
| Femorali | 41 |
| Avambracci | 28 |
| Abduttori | 22 |
| Adduttori | 20 |
| Trapezio | 19 |
| Tibiali | 6 |

### Distribuzione per Difficoltà

| Livello | Conteggio |
|---------|-----------|
| Novizio | 1.105 |
| Intermedio | 1.092 |
| Avanzato | 462 |
| Principiante | 414 |
| Esperto | 126 |
| Master | 32 |
| Gran Master | 8 |
| Leggendario | 3 |

---

## Istruzioni per il Deploy

### Prerequisiti
- PostgreSQL in esecuzione
- Node.js con Prisma CLI

### Passaggi

1. **Copiare i file aggiornati** sul server (schema.prisma, seed.js, import-esercizi.js, dati/*.json)

2. **Generare e applicare la migrazione Prisma**:
   ```bash
   npx prisma migrate dev --name aggiungi_campi_esercizi_v29
   ```

3. **Eseguire lo script di importazione** (metodo consigliato per produzione):
   ```bash
   node prisma/import-esercizi.js
   ```
   
   Oppure, per un database nuovo, usare il seed:
   ```bash
   npx prisma db seed
   ```

4. **Verificare** l'importazione accedendo alla pagina Admin Esercizi nell'app.

### Note Importanti
- Lo script di importazione è **idempotente**: può essere eseguito più volte senza creare duplicati
- Gli esercizi già esistenti vengono **aggiornati** con i nuovi campi
- Il collegamento palestra-attrezzatura viene aggiornato automaticamente

---

## Ri-generare il JSON dal file Excel

Se il file Excel viene aggiornato a una nuova versione:

```bash
cd backend/prisma/dati
python converti_excel.py
```

Lo script sovrascriverà `esercizi.json` con i nuovi dati. Poi eseguire `import-esercizi.js` per sincronizzare il database.
