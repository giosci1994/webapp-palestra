# Riferimento Precedente nel Workout Live

## Descrizione
Durante un allenamento live, il sistema mostra un banner informativo con i dati dell'ultimo allenamento fatto con la stessa scheda. L'utente può confrontare peso e ripetizioni dell'esercizio corrente con quelli fatti in precedenza.

## API Backend

### `GET /api/v1/sessioni/precedente/:schedaId`
Restituisce i log dell'ultima sessione completata per una scheda specifica, raggruppati per esercizio.

**Parametri URL:**
| Parametro | Tipo | Descrizione |
|-----------|------|-------------|
| `schedaId` | int | ID della scheda |

**Risposta (con dati):**
```json
{
  "successo": true,
  "dati": {
    "id": 42,
    "dataInizio": "2026-04-28T10:00:00Z",
    "dataFine": "2026-04-28T11:15:00Z",
    "durataMinuti": 75,
    "volumeTotaleKg": 4500,
    "logPerEsercizio": {
      "1": {
        "esercizio": { "id": 1, "nome": "Panca Piana", "gruppoMuscoloPrimario": "Petto" },
        "serie": [
          { "serieNumero": 1, "pesoEffettivo": 80, "repEffettive": 10, "rpe": 7 },
          { "serieNumero": 2, "pesoEffettivo": 85, "repEffettive": 8, "rpe": 8 }
        ]
      }
    }
  }
}
```

**Risposta (nessuna sessione precedente):**
```json
{
  "successo": true,
  "dati": null
}
```

## Frontend — Banner nel WorkoutLive

### Posizione
Il banner appare sotto i bottoni azione ("Serie Completata", "Salta Serie", "Cambia Esercizio"), solo quando:
- Esiste almeno una sessione precedente per la stessa scheda
- L'esercizio corrente ha dei log nella sessione precedente

### Layout del banner
```
┌──────────────────────────────────────────┐
│ 📊 Ultimo: 28 apr 2026                  │
│ ─────────────────────────────────────    │
│ Serie 1: 80 kg × 10                     │
│ Serie 2: 85 kg × 8        ↑             │
│ Serie 3: 85 kg × 7                      │
└──────────────────────────────────────────┘
```

### Indicatori di progresso
Quando una serie dell'allenamento corrente è completata, viene confrontata con la corrispondente serie precedente:
- **↑ verde**: peso corrente superiore al precedente (progresso)
- **↓ rosso**: peso corrente inferiore al precedente (regressione)
- **= grigio**: stesso peso

### Implementazione
- **State**: `datiPrecedenti` — contiene la risposta API
- **Derivazione**: `seriePrecedenti` — filtrato per `esercizioAttuale.esercizioId`
- **Fetch**: `useEffect` su `sessione.schedaId` — una sola chiamata all'avvio
- **Aggiornamento indicatori**: avviene automaticamente al completamento di ogni serie tramite `serieEsercizio` (le serie completate in questa sessione)

### Supporto Cardio
Per esercizi cardio, il banner mostra:
- Durata in minuti
- Livello di resistenza (se presente)
