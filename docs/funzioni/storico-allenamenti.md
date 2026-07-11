# Storico Allenamenti

## Descrizione
Pagina dedicata alla visualizzazione completa di tutte le sessioni di allenamento passate dell'utente. Permette di rivedere peso, ripetizioni, RPE e altri dettagli per ogni serie di ogni esercizio.

## API Backend

### `GET /api/v1/sessioni/storico`
Restituisce la lista delle sessioni completate con i log raggruppati per esercizio.

**Query Parameters:**
| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `pagina` | int | 1 | Numero pagina |
| `limite` | int | 15 | Sessioni per pagina |
| `schedaId` | int | — | Filtra per scheda specifica |

**Risposta:**
```json
{
  "successo": true,
  "dati": [
    {
      "id": 1,
      "dataInizio": "2026-05-01T10:00:00Z",
      "dataFine": "2026-05-01T11:15:00Z",
      "durataMinuti": 75,
      "volumeTotaleKg": 4500,
      "noteFinali": "Buon allenamento",
      "scheda": {
        "id": 3,
        "titolo": "Push Day",
        "numEsercizi": 5
      },
      "serieCompletate": 15,
      "esercizi": [
        {
          "esercizio": { "id": 1, "nome": "Panca Piana", "gruppoMuscoloPrimario": "Petto" },
          "serie": [
            { "serieNumero": 1, "pesoEffettivo": 80, "repEffettive": 10, "rpe": 7 },
            { "serieNumero": 2, "pesoEffettivo": 85, "repEffettive": 8, "rpe": 8 }
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

## Frontend

### Componente: `StoricoAllenamenti.jsx`
- **Percorso:** `/storico`
- **Posizione:** `frontend/src/pagine/StoricoAllenamenti.jsx`

### Funzionalità:
1. **Lista sessioni a card**: ogni card mostra data, scheda, durata, volume, esercizi
2. **Drawer dettaglio**: cliccando su una sessione si apre un bottom sheet con:
   - KPI (durata, volume, serie totali)
   - Note finali
   - Lista esercizi con tabella serie (peso/rep/RPE)
   - Supporto esercizi cardio (durata/livello)
3. **Filtro per scheda**: bottoni per filtrare le sessioni per una scheda specifica
4. **Paginazione**: navigazione tra pagine di risultati
5. **Eliminazione**: possibilità di eliminare una sessione (con conferma)

### Navigazione:
- **Sidebar desktop**: voce "📜 Storico" dopo "Allenamento"
- **Dashboard**: link "📜 Vedi storico completo" nella sezione "Attività recente"
