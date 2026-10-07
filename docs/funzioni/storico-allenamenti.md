# Storico Allenamenti

## Descrizione
Pagina dedicata alla visualizzazione completa di tutte le sessioni di allenamento passate dell'utente. Permette di rivedere peso, ripetizioni, RPE e altri dettagli per ogni serie di ogni esercizio, e di correggere una sessione sbagliata (per esempio un allenamento rimasto aperto tutta la notte).

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
      "minutiRiscaldamento": 10,
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
            { "id": 101, "serieNumero": 1, "pesoEffettivo": 80, "repEffettive": 10, "rpe": 7 },
            { "id": 102, "serieNumero": 2, "pesoEffettivo": 85, "repEffettive": 8, "rpe": 8 }
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
Corregge un allenamento **concluso** (per uno in corso risponde 400). Solo il proprietario o un SUPERADMIN. Cambia solo i campi presenti nel corpo; tutto viene salvato in una transazione, quindi un errore non lascia modifiche a metà.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `dataInizio` | string ISO | Nuovo inizio (non nel futuro, non oltre 2 anni fa) |
| `durataMinuti` | int | Da 1 a 600. La fine si ricalcola da inizio + durata e non può cadere nel futuro |
| `minutiRiscaldamento` | int \| null | `null` lo svuota |
| `noteFinali` | string \| null | Vuote → `null` |
| `serie` | array | Elenco **completo** delle serie svolte dopo la modifica, nell'ordine in cui mostrarle |

Ogni elemento di `serie` è `{ id, ...valori }` per una serie esistente oppure `{ esercizioId, ...valori }` per una nuova, aggiunta a un esercizio già presente nella sessione. Le serie svolte che mancano dall'elenco vengono eliminate; quelle saltate (`completato: false`) non compaiono nello storico e restano come sono. Valori: `pesoEffettivo`, `repEffettive`, `rpe` (1-10), `durataMinuti`, `livelloResistenza`; un campo assente resta com'è.

Dopo una modifica delle serie:
- le serie di ogni esercizio vengono rinumerate 1..n;
- il volume (`volumeTotaleKg`) si ricalcola;
- i record personali si riallineano: sparisce un record nato da un peso che la sessione conteneva e che nessuna serie raggiunge più (800 kg scritto al posto di 80), e se il massimo vero resta senza record ne nasce uno, datato all'allenamento in cui è stato sollevato.

Se cambia il giorno, l'eventuale allenamento programmato chiuso da questa sessione torna da fare e viene chiuso quello del giorno nuovo (stessa scheda).

**Risposta:** `{ successo, dati, recordPersonali }`, dove `dati` è la sessione nel formato di `/storico` e `recordPersonali` i record creati.

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
6. **Modifica** (`ModificaAllenamento.jsx`, dal pulsante "✏️ Modifica" del drawer):
   - giorno, ora d'inizio, ora di fine e durata: ora di fine e durata sono collegate, si compila quella che si ricorda (una fine prima dell'inizio cade il giorno dopo);
   - riscaldamento e note;
   - serie: correggere peso, ripetizioni e RPE (minuti e livello per il cardio), eliminarle o aggiungerne a un esercizio già presente;
   - viene inviato solo ciò che è cambiato; chiudendo con modifiche non salvate chiede conferma.
7. **Durata sospetta**: oltre 4 ore (`DURATA_SOSPETTA_MINUTI`) la durata è evidenziata nell'elenco e nel drawer, con un pulsante "Correggi" che apre la modifica. È il segno di un allenamento rimasto aperto, chiuso con "Termina" ore dopo.

### Navigazione:
- **Sidebar desktop**: voce "📜 Storico" dopo "Allenamento"
- **Dashboard**: link "📜 Vedi storico completo" nella sezione "Attività recente"
