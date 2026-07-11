# GymMaster — Modulo Assistente AI

## Panoramica
Assistente fitness virtuale **"GymBot"** alimentato da **Google Gemini API** (modello Flash, tier gratuito). Fornisce suggerimenti personalizzati basati sui dati di allenamento dell'utente.

## Funzionalità
- 📊 Analisi schede di allenamento
- 📈 Suggerimenti sulla progressione dei carichi
- ⚖️ Identificazione squilibri muscolari
- 🔄 Sostituzione esercizi (macchinario occupato)
- 💬 Risposte a domande generiche sul fitness

## Configurazione

### Ottenere la API Key (gratuita)
1. Vai su [Google AI Studio](https://aistudio.google.com/apikey)
2. Accedi con un account Google
3. Clicca "Create API Key"
4. Copia la chiave nel file `.env`:
   ```
   GEMINI_API_KEY=la_tua_chiave_qui
   ```

### Limiti del Tier Gratuito
| Risorsa | Limite |
|---------|--------|
| Richieste/minuto | ~15 RPM |
| Token/giorno | ~1M TPD |
| Costo | Gratuito |
| Carta di credito | Non richiesta |

## Endpoint

| Metodo | Percorso | Rate Limit | Descrizione |
|--------|----------|------------|-------------|
| POST | `/api/v1/assistente/chiedi` | 5/min per utente | Invia domanda |
| GET | `/api/v1/assistente/conversazioni` | 5/min per utente | Storico conversazioni |

### Esempio Richiesta
```json
POST /api/v1/assistente/chiedi
{
  "messaggio": "Ho fatto 100kg di panca piana con RPE 6, dovrei aumentare il carico?",
  "conversazioneAiId": null
}
```

### Esempio Risposta
```json
{
  "successo": true,
  "dati": {
    "conversazioneAiId": 42,
    "risposta": "💪 Se il tuo RPE era 6 a 100kg, hai ancora margine! Ti suggerisco di aumentare di 2.5kg alla prossima sessione..."
  }
}
```

## Contesto Automatico
L'assistente riceve automaticamente:
- Nome dell'utente e palestra
- Ultime 5 sessioni di allenamento
- Record personali recenti
- Storico della conversazione (ultimi 20 messaggi)

Questo permette risposte **personalizzate** senza che l'utente debba ripetere informazioni.
